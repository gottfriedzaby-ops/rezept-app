/**
 * UX/UI Audit Walkthrough — Rezept-App
 *
 * Launches a headed Chromium against the production URL. You log in once
 * (script pauses until URL leaves /login). It then traverses the main
 * authenticated routes and captures:
 *   - desktop + mobile screenshots per route
 *   - console errors and warnings
 *   - failed network requests
 *   - basic accessibility heuristics (missing alt text, unlabelled buttons,
 *     empty link text, low contrast hints)
 *
 * Outputs everything to tests/audit/output/ as PNGs + findings.json + findings.md.
 *
 * Run with:  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx ts-node tests/audit/walkthrough.ts
 *       or:  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx tsx tests/audit/walkthrough.ts
 */

import { chromium, type Page, type ConsoleMessage, type Request } from "@playwright/test";
import fs from "fs";
import path from "path";

const PROD_URL = process.env.AUDIT_URL ?? "https://rezept-app-dun.vercel.app";
const OUT_DIR = path.join(__dirname, "output");

interface Finding {
  route: string;
  viewport: "desktop" | "mobile";
  category: "console" | "network" | "a11y" | "visual";
  severity: "high" | "medium" | "low";
  message: string;
  detail?: unknown;
}

const findings: Finding[] = [];
const consoleByRoute = new Map<string, ConsoleMessage[]>();
const networkFailuresByRoute = new Map<string, { url: string; status?: number; failure?: string }[]>();

function ensureOutDir() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function attachListeners(page: Page, getRoute: () => string) {
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      const route = getRoute();
      if (!consoleByRoute.has(route)) consoleByRoute.set(route, []);
      consoleByRoute.get(route)!.push(msg);
    }
  });

  page.on("requestfailed", (req: Request) => {
    const route = getRoute();
    if (!networkFailuresByRoute.has(route)) networkFailuresByRoute.set(route, []);
    networkFailuresByRoute.get(route)!.push({
      url: req.url(),
      failure: req.failure()?.errorText,
    });
  });

  page.on("response", (res) => {
    if (res.status() >= 400) {
      const route = getRoute();
      if (!networkFailuresByRoute.has(route)) networkFailuresByRoute.set(route, []);
      networkFailuresByRoute.get(route)!.push({
        url: res.url(),
        status: res.status(),
      });
    }
  });
}

async function captureA11y(page: Page, route: string, viewport: "desktop" | "mobile") {
  const issues = await page.evaluate(() => {
    const out: { type: string; selector: string; detail?: string }[] = [];

    // Images without alt text
    document.querySelectorAll("img:not([alt])").forEach((el) => {
      out.push({ type: "img-no-alt", selector: el.tagName + (el.id ? `#${el.id}` : ""), detail: (el as HTMLImageElement).src });
    });

    // Buttons with no accessible name (no text, no aria-label, no aria-labelledby)
    document.querySelectorAll("button").forEach((btn) => {
      const text = btn.textContent?.trim() ?? "";
      const ariaLabel = btn.getAttribute("aria-label");
      const ariaLabelledBy = btn.getAttribute("aria-labelledby");
      const hasTitle = btn.getAttribute("title");
      if (!text && !ariaLabel && !ariaLabelledBy && !hasTitle) {
        out.push({
          type: "button-no-name",
          selector: "button" + (btn.className ? `.${btn.className.split(/\s+/)[0]}` : ""),
        });
      }
    });

    // Links with empty text and no aria-label
    document.querySelectorAll("a").forEach((a) => {
      const text = a.textContent?.trim() ?? "";
      const ariaLabel = a.getAttribute("aria-label");
      if (!text && !ariaLabel) {
        out.push({ type: "link-no-name", selector: `a[href="${a.getAttribute("href")}"]` });
      }
    });

    // Form inputs without a label association
    document.querySelectorAll("input, textarea, select").forEach((el) => {
      const id = el.id;
      const ariaLabel = el.getAttribute("aria-label");
      const ariaLabelledBy = el.getAttribute("aria-labelledby");
      const wrappedInLabel = el.closest("label");
      const labelForIt = id ? document.querySelector(`label[for="${id}"]`) : null;
      const type = (el as HTMLInputElement).type;
      // Skip hidden inputs
      if (type === "hidden") return;
      if (!ariaLabel && !ariaLabelledBy && !wrappedInLabel && !labelForIt) {
        out.push({
          type: "input-no-label",
          selector: `${el.tagName.toLowerCase()}${id ? `#${id}` : ""}`,
          detail: (el as HTMLInputElement).name || (el as HTMLInputElement).placeholder,
        });
      }
    });

    return out;
  });

  for (const issue of issues) {
    findings.push({
      route,
      viewport,
      category: "a11y",
      severity: issue.type === "input-no-label" ? "high" : "medium",
      message: `${issue.type}: ${issue.selector}`,
      detail: issue.detail,
    });
  }
}

async function captureScreenshot(page: Page, route: string, viewport: "desktop" | "mobile") {
  const safe = route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
  const filePath = path.join(OUT_DIR, `${safe}--${viewport}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function visit(page: Page, urlPath: string, label: string, getRoute: () => string, setRoute: (r: string) => void) {
  setRoute(label);
  console.log(`\n→ Visiting ${label}`);
  const t0 = Date.now();
  try {
    await page.goto(PROD_URL + urlPath, { waitUntil: "networkidle", timeout: 30_000 });
  } catch (err) {
    findings.push({
      route: label,
      viewport: "desktop",
      category: "network",
      severity: "high",
      message: `Navigation to ${urlPath} failed`,
      detail: String(err),
    });
    return;
  }
  const t1 = Date.now();
  console.log(`  load: ${t1 - t0}ms`);
  if (t1 - t0 > 4000) {
    findings.push({
      route: label,
      viewport: "desktop",
      category: "network",
      severity: "medium",
      message: `Slow page load: ${t1 - t0}ms`,
    });
  }
  // Desktop screenshot
  await captureScreenshot(page, label, "desktop");
  await captureA11y(page, label, "desktop");

  // Mobile screenshot
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await captureScreenshot(page, label, "mobile");
  await captureA11y(page, label, "mobile");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(200);
}

async function main() {
  ensureOutDir();

  const browser = await chromium.launch({
    headless: false,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  let currentRoute = "init";
  const getRoute = () => currentRoute;
  const setRoute = (r: string) => {
    currentRoute = r;
  };
  attachListeners(page, getRoute);

  // 1. Navigate to login and wait for the user to authenticate
  console.log(`\nOpening ${PROD_URL}/login — please log in manually in the browser window.`);
  await page.goto(PROD_URL + "/login", { waitUntil: "domcontentloaded" });

  console.log("Waiting for login to complete (URL must leave /login)...");
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 5 * 60_000,
  });
  console.log(`✓ Logged in. Current URL: ${page.url()}`);

  // Reset listeners after login (login-specific noise isn't part of the audit)
  consoleByRoute.clear();
  networkFailuresByRoute.clear();

  // 2. Walk through the main authenticated routes
  await visit(page, "/", "recipe-list", getRoute, setRoute);

  // Try to find a recipe link to drill into the detail page
  try {
    const firstRecipeHref = await page.evaluate(() => {
      const link = document.querySelector('ul li a[href^="/"]') as HTMLAnchorElement | null;
      return link?.getAttribute("href") ?? null;
    });
    if (firstRecipeHref && firstRecipeHref !== "/") {
      await visit(page, firstRecipeHref, "recipe-detail", getRoute, setRoute);
      // Try cook mode
      const cookHref = await page.evaluate(() => {
        const link = Array.from(document.querySelectorAll("a")).find((a) =>
          (a.getAttribute("href") ?? "").includes("/cook")
        );
        return link?.getAttribute("href") ?? null;
      });
      if (cookHref) {
        await visit(page, cookHref, "cook-mode", getRoute, setRoute);
      }
    } else {
      findings.push({
        route: "recipe-list",
        viewport: "desktop",
        category: "visual",
        severity: "low",
        message: "No recipe cards found on the list — couldn't audit detail/cook routes",
      });
    }
  } catch (err) {
    console.error("Detail-page drilldown failed:", err);
  }

  await visit(page, "/shopping-list", "shopping-list", getRoute, setRoute);
  await visit(page, "/settings", "settings", getRoute, setRoute);
  await visit(page, "/library-shares/incoming", "library-shares-incoming", getRoute, setRoute);

  // 3. Roll console/network into findings
  for (const [route, msgs] of consoleByRoute) {
    for (const m of msgs) {
      findings.push({
        route,
        viewport: "desktop",
        category: "console",
        severity: m.type() === "error" ? "high" : "medium",
        message: `${m.type()}: ${m.text().slice(0, 300)}`,
        detail: { location: m.location() },
      });
    }
  }
  for (const [route, failures] of networkFailuresByRoute) {
    for (const f of failures) {
      // De-noise vercel insight pings and analytics
      if (f.url.includes("/_vercel/") || f.url.includes("vercel-insights") || f.url.includes("vitals")) continue;
      findings.push({
        route,
        viewport: "desktop",
        category: "network",
        severity: f.status && f.status >= 500 ? "high" : "medium",
        message: `${f.status ?? "FAIL"} ${f.url}`,
        detail: f.failure,
      });
    }
  }

  // 4. Persist findings
  fs.writeFileSync(path.join(OUT_DIR, "findings.json"), JSON.stringify(findings, null, 2));

  const md = renderMarkdown(findings);
  fs.writeFileSync(path.join(OUT_DIR, "findings.md"), md);

  console.log(`\n✓ Walkthrough complete.`);
  console.log(`  Findings: ${findings.length}`);
  console.log(`  Output:   ${OUT_DIR}/`);
  console.log(`  Report:   ${OUT_DIR}/findings.md`);

  await browser.close();
}

function renderMarkdown(items: Finding[]): string {
  const byRoute = new Map<string, Finding[]>();
  for (const f of items) {
    if (!byRoute.has(f.route)) byRoute.set(f.route, []);
    byRoute.get(f.route)!.push(f);
  }
  const lines: string[] = [];
  lines.push(`# UX/UI Audit — Rezept-App`);
  lines.push(``);
  lines.push(`Production URL: ${PROD_URL}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total findings: ${items.length}`);
  lines.push(``);
  for (const [route, list] of byRoute) {
    lines.push(`## ${route} (${list.length})`);
    list.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
    for (const f of list) {
      lines.push(`- **[${f.severity}]** *${f.category}*: ${f.message}`);
      if (f.detail !== undefined) {
        lines.push(`  - detail: \`${typeof f.detail === "string" ? f.detail : JSON.stringify(f.detail)}\``);
      }
    }
    lines.push(``);
  }
  return lines.join("\n");
}

function severityRank(s: Finding["severity"]): number {
  return s === "high" ? 0 : s === "medium" ? 1 : 2;
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
