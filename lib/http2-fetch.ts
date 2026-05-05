import * as http2 from "node:http2";
import { promisify } from "node:util";
import { gunzip, brotliDecompress, inflate } from "node:zlib";

const gunzipP = promisify(gunzip);
const brotliP = promisify(brotliDecompress);
const inflateP = promisify(inflate);

export interface H2Response {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

async function h2get(
  url: string,
  headers: Record<string, string>,
  hops: number
): Promise<H2Response> {
  if (hops > 5) throw new Error("Too many redirects");
  const { origin, pathname, search, host } = new URL(url);

  return new Promise<H2Response>((resolve, reject) => {
    const client = http2.connect(origin);
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const timer = setTimeout(
      () => finish(() => { client.destroy(); reject(new Error("Request timed out")); }),
      30_000
    );

    client.on("error", (err) => finish(() => { clearTimeout(timer); reject(err); }));

    // HTTP/2 requires lowercase header names; normalise defensively.
    const lc = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const req = client.request({
      ":method": "GET",
      ":path": pathname + (search ?? ""),
      ":scheme": "https",
      ":authority": host,
      ...lc,
    });

    const chunks: Buffer[] = [];
    let status = 0;
    let enc = "";
    let loc = "";

    req.on("response", (h) => {
      status = parseInt(String(h[":status"] ?? "0"), 10);
      enc = String(h["content-encoding"] ?? "");
      loc = String(h["location"] ?? "");
    });

    req.on("data", (c: Buffer | string) =>
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
    );

    req.on("end", () =>
      finish(() => {
        clearTimeout(timer);
        client.close();

        if (status >= 300 && status < 400 && loc) {
          const next = loc.startsWith("http") ? loc : new URL(loc, url).href;
          resolve(h2get(next, headers, hops + 1));
          return;
        }

        const raw = Buffer.concat(chunks);
        resolve({
          ok: status >= 200 && status < 300,
          status,
          text: async () => {
            if (enc === "gzip")    return (await gunzipP(raw)).toString("utf8");
            if (enc === "br")      return (await brotliP(raw)).toString("utf8");
            if (enc === "deflate") return (await inflateP(raw)).toString("utf8");
            return raw.toString("utf8");
          },
        });
      })
    );

    req.on("error", (err) =>
      finish(() => { clearTimeout(timer); client.close(); reject(err); })
    );

    req.end();
  });
}

/**
 * HTTP/2 GET with decompression and redirect following.
 * Use this instead of fetch() when Cloudflare's HTTP/2 fingerprint check
 * would reject a plain HTTP/1.1 request.
 */
export function fetchHttp2(
  url: string,
  headers: Record<string, string>
): Promise<H2Response> {
  return h2get(url, headers, 0);
}
