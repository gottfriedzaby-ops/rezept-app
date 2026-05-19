import { isValidWindow, parseWindow, windowStart } from "@/lib/admin-metrics";

describe("isValidWindow", () => {
  it("accepts the four valid keys", () => {
    expect(isValidWindow("24h")).toBe(true);
    expect(isValidWindow("7d")).toBe(true);
    expect(isValidWindow("30d")).toBe(true);
    expect(isValidWindow("all")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidWindow("1y")).toBe(false);
    expect(isValidWindow("")).toBe(false);
    expect(isValidWindow(null)).toBe(false);
    expect(isValidWindow(undefined)).toBe(false);
    expect(isValidWindow(7)).toBe(false);
  });
});

describe("parseWindow", () => {
  it("returns the value when valid", () => {
    expect(parseWindow("24h")).toBe("24h");
    expect(parseWindow("30d")).toBe("30d");
  });

  it("defaults to 7d for invalid / missing input", () => {
    expect(parseWindow(null)).toBe("7d");
    expect(parseWindow("garbage")).toBe("7d");
  });
});

describe("windowStart", () => {
  it("returns a Date roughly 24h in the past for '24h'", () => {
    const now = Date.now();
    const start = windowStart("24h").getTime();
    const diff = now - start;
    // Allow ±100ms for the call overhead.
    expect(diff).toBeGreaterThan(24 * 60 * 60 * 1000 - 100);
    expect(diff).toBeLessThan(24 * 60 * 60 * 1000 + 100);
  });

  it("returns the Unix epoch for 'all'", () => {
    expect(windowStart("all").getTime()).toBe(0);
  });

  it("7d window is 7× larger than 24h window", () => {
    const now = Date.now();
    const d7 = now - windowStart("7d").getTime();
    const d24 = now - windowStart("24h").getTime();
    // Drift is < 1s for both, ratio should be close to 7.
    expect(Math.abs(d7 / d24 - 7)).toBeLessThan(0.001);
  });
});
