import {
  addDays,
  getWeekDates,
  getWeekStart,
  isValidIsoDate,
  snapToWeekStart,
} from "@/lib/meal-plan";

describe("isValidIsoDate", () => {
  it("accepts real ISO dates", () => {
    expect(isValidIsoDate("2026-06-11")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true); // leap day
  });

  it("rejects malformed or impossible dates", () => {
    expect(isValidIsoDate("2026-6-11")).toBe(false);
    expect(isValidIsoDate("11.06.2026")).toBe(false);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2025-02-29")).toBe(false); // not a leap year
    expect(isValidIsoDate("")).toBe(false);
    expect(isValidIsoDate("not-a-date")).toBe(false);
  });
});

describe("getWeekStart / snapToWeekStart", () => {
  it("returns the Monday of a mid-week date", () => {
    // 2026-06-11 is a Thursday
    expect(snapToWeekStart("2026-06-11")).toBe("2026-06-08");
    expect(getWeekStart(new Date(2026, 5, 11))).toBe("2026-06-08");
  });

  it("keeps a Monday unchanged", () => {
    expect(snapToWeekStart("2026-06-08")).toBe("2026-06-08");
  });

  it("maps Sunday to the preceding Monday", () => {
    // 2026-06-14 is a Sunday
    expect(snapToWeekStart("2026-06-14")).toBe("2026-06-08");
  });

  it("handles year boundaries", () => {
    // 2026-01-01 is a Thursday → week starts Monday 2025-12-29
    expect(snapToWeekStart("2026-01-01")).toBe("2025-12-29");
  });
});

describe("addDays", () => {
  it("adds and subtracts days across month boundaries", () => {
    expect(addDays("2026-06-08", 7)).toBe("2026-06-15");
    expect(addDays("2026-06-01", -1)).toBe("2026-05-31");
    expect(addDays("2026-12-29", 7)).toBe("2027-01-05");
  });

  it("crosses the DST switch without skipping a day (UTC math)", () => {
    // European DST starts 2026-03-29
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
  });
});

describe("getWeekDates", () => {
  it("returns 7 consecutive dates starting at the week start", () => {
    const dates = getWeekDates("2026-06-08");
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe("2026-06-08");
    expect(dates[6]).toBe("2026-06-14");
  });
});
