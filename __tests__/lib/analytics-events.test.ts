import {
  ANALYTICS_DEFAULT_ENABLED,
  EVENT_CATEGORY,
  isAnalyticsEventName,
  normalizeRoute,
  type AnalyticsEventName,
} from "@/lib/analytics-events";

describe("analytics-events taxonomy", () => {
  it("recognises every declared event name and rejects unknown ones", () => {
    for (const name of Object.keys(EVENT_CATEGORY)) {
      expect(isAnalyticsEventName(name)).toBe(true);
    }
    expect(isAnalyticsEventName("totally_made_up")).toBe(false);
    expect(isAnalyticsEventName("")).toBe(false);
    expect(isAnalyticsEventName(null)).toBe(false);
    expect(isAnalyticsEventName(42)).toBe(false);
  });

  it("maps every event name to a category", () => {
    for (const name of Object.keys(EVENT_CATEGORY) as AnalyticsEventName[]) {
      expect(typeof EVENT_CATEGORY[name]).toBe("string");
      expect(EVENT_CATEGORY[name].length).toBeGreaterThan(0);
    }
  });

  it("defaults to opt-out (tracking on)", () => {
    expect(ANALYTICS_DEFAULT_ENABLED).toBe(true);
  });
});

describe("normalizeRoute", () => {
  it("strips the locale prefix", () => {
    expect(normalizeRoute("/de/meal-plan")).toBe("/meal-plan");
    expect(normalizeRoute("/en/collections")).toBe("/collections");
    expect(normalizeRoute("/nl")).toBe("/");
  });

  it("replaces uuid segments with a placeholder", () => {
    expect(normalizeRoute("/de/11111111-2222-3333-4444-555555555555/cook")).toBe(
      "/[id]/cook",
    );
    expect(normalizeRoute("/de/11111111-2222-3333-4444-555555555555")).toBe("/[id]");
  });

  it("replaces long opaque tokens with a placeholder", () => {
    expect(normalizeRoute("/de/shared/AbCdEfGhIjKlMnOpQrStUvWx")).toBe("/shared/[token]");
  });

  it("strips query strings and hashes", () => {
    expect(normalizeRoute("/de/search?q=secret")).toBe("/search");
    expect(normalizeRoute("/de/meal-plan#week")).toBe("/meal-plan");
  });

  it("keeps ordinary route segments", () => {
    expect(normalizeRoute("/de/nutrition/fasting")).toBe("/nutrition/fasting");
  });
});
