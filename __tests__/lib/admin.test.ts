import { isAdmin, isAdminEmail } from "@/lib/admin";

describe("isAdminEmail", () => {
  const originalEnv = process.env.ADMIN_EMAILS;

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalEnv;
  });

  it("returns false when ADMIN_EMAILS is unset", () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail("alice@example.com")).toBe(false);
  });

  it("returns false when ADMIN_EMAILS is empty string", () => {
    process.env.ADMIN_EMAILS = "";
    expect(isAdminEmail("alice@example.com")).toBe(false);
  });

  it("returns true for a matching email", () => {
    process.env.ADMIN_EMAILS = "alice@example.com,bob@example.com";
    expect(isAdminEmail("alice@example.com")).toBe(true);
    expect(isAdminEmail("bob@example.com")).toBe(true);
  });

  it("is case-insensitive on both env and input", () => {
    process.env.ADMIN_EMAILS = "Alice@Example.COM";
    expect(isAdminEmail("ALICE@example.com")).toBe(true);
    expect(isAdminEmail("alice@example.com")).toBe(true);
  });

  it("trims whitespace in env and input", () => {
    process.env.ADMIN_EMAILS = "  alice@example.com  , bob@example.com ";
    expect(isAdminEmail("  alice@example.com  ")).toBe(true);
    expect(isAdminEmail("bob@example.com")).toBe(true);
  });

  it("returns false for non-matching emails", () => {
    process.env.ADMIN_EMAILS = "alice@example.com";
    expect(isAdminEmail("eve@example.com")).toBe(false);
  });

  it("returns false for empty / nullish input", () => {
    process.env.ADMIN_EMAILS = "alice@example.com";
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });

  it("ignores empty entries between commas", () => {
    process.env.ADMIN_EMAILS = "alice@example.com,,bob@example.com,";
    expect(isAdminEmail("alice@example.com")).toBe(true);
    expect(isAdminEmail("bob@example.com")).toBe(true);
  });
});

describe("isAdmin", () => {
  const originalEnv = process.env.ADMIN_EMAILS;

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalEnv;
  });

  it("returns false for null / undefined user", () => {
    process.env.ADMIN_EMAILS = "alice@example.com";
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  it("returns false for a user with no email", () => {
    process.env.ADMIN_EMAILS = "alice@example.com";
    expect(isAdmin({ email: undefined })).toBe(false);
    expect(isAdmin({ email: null })).toBe(false);
  });

  it("delegates to isAdminEmail for the user.email field", () => {
    process.env.ADMIN_EMAILS = "alice@example.com";
    expect(isAdmin({ email: "alice@example.com" })).toBe(true);
    expect(isAdmin({ email: "eve@example.com" })).toBe(false);
  });
});
