import { normalizeEmail, isInviteOnlyEnabled } from "@/lib/invited-emails";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Alice@EXAMPLE.com ")).toBe("alice@example.com");
  });

  it("is idempotent", () => {
    const once = normalizeEmail("Foo@Bar.com");
    expect(normalizeEmail(once)).toBe(once);
  });
});

describe("isInviteOnlyEnabled", () => {
  const original = process.env.INVITE_ONLY_REGISTRATION;

  afterEach(() => {
    process.env.INVITE_ONLY_REGISTRATION = original;
  });

  it("defaults to true when the env var is unset", () => {
    delete process.env.INVITE_ONLY_REGISTRATION;
    expect(isInviteOnlyEnabled()).toBe(true);
  });

  it("is true when set to 'true'", () => {
    process.env.INVITE_ONLY_REGISTRATION = "true";
    expect(isInviteOnlyEnabled()).toBe(true);
  });

  it("is true when set to 'TRUE' (case-insensitive)", () => {
    process.env.INVITE_ONLY_REGISTRATION = "TRUE";
    expect(isInviteOnlyEnabled()).toBe(true);
  });

  it("is false when set to 'false'", () => {
    process.env.INVITE_ONLY_REGISTRATION = "false";
    expect(isInviteOnlyEnabled()).toBe(false);
  });

  it("is false when set to anything else (only 'true' enables)", () => {
    process.env.INVITE_ONLY_REGISTRATION = "yes";
    expect(isInviteOnlyEnabled()).toBe(false);
  });
});
