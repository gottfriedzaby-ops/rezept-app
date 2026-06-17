import {
  APP_VERSION,
  RELEASES,
  compareVersions,
  getReleasesSince,
} from "@/lib/changelog";

describe("compareVersions", () => {
  it("orders by major, then minor, then patch", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.2.0", "1.1.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "2.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.1", "1.0.0")).toBeGreaterThan(0);
  });

  it("treats missing segments as zero", () => {
    expect(compareVersions("1", "1.0.0")).toBe(0);
    expect(compareVersions("1.1", "1.0.5")).toBeGreaterThan(0);
  });

  it("treats unparseable segments as zero", () => {
    expect(compareVersions("garbage", "0.0.0")).toBe(0);
  });
});

describe("RELEASES manifest", () => {
  it("is sorted newest-first with strictly descending versions", () => {
    for (let i = 1; i < RELEASES.length; i++) {
      expect(
        compareVersions(RELEASES[i - 1].version, RELEASES[i].version)
      ).toBeGreaterThan(0);
    }
  });

  it("has unique versions and message keys", () => {
    const versions = RELEASES.map((r) => r.version);
    const keys = RELEASES.map((r) => r.messageKey);
    expect(new Set(versions).size).toBe(versions.length);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("exposes the newest release as APP_VERSION", () => {
    expect(APP_VERSION).toBe(RELEASES[0].version);
  });
});

describe("getReleasesSince", () => {
  it("shows only the latest release on first visit (null)", () => {
    expect(getReleasesSince(null)).toEqual([RELEASES[0]]);
  });

  it("returns nothing when already on the current version", () => {
    expect(getReleasesSince(APP_VERSION)).toEqual([]);
  });

  it("returns nothing for a future/newer stored version", () => {
    expect(getReleasesSince("99.0.0")).toEqual([]);
  });

  it("cumulates every release newer than the last seen version", () => {
    const oldest = RELEASES[RELEASES.length - 1].version;
    expect(getReleasesSince(oldest)).toEqual(RELEASES.slice(0, RELEASES.length - 1));
  });

  it("returns all releases when the stored version predates the manifest", () => {
    expect(getReleasesSince("0.0.1")).toEqual(RELEASES);
  });

  it("keeps newest-first ordering for a mid-history version", () => {
    const versions = getReleasesSince("1.1.0").map((r) => r.version);
    expect(versions).toEqual(["1.4.1", "1.4.0", "1.3.0", "1.2.0"]);
  });
});
