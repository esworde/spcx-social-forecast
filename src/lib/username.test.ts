import { describe, expect, it } from "vitest";
import { normalizeUsername, validateUsername } from "./username";

describe("normalizeUsername", () => {
  it("trims and lowercases usernames", () => {
    expect(normalizeUsername("  Alice-HN_42  ")).toBe("alice-hn_42");
  });
});

describe("validateUsername", () => {
  it("accepts short safe usernames", () => {
    expect(validateUsername("alice_42")).toEqual({ ok: true, username: "alice_42" });
  });

  it("rejects empty usernames", () => {
    expect(validateUsername("   ")).toEqual({
      ok: false,
      message: "Enter a username."
    });
  });

  it("rejects unsupported characters", () => {
    expect(validateUsername("alice!")).toEqual({
      ok: false,
      message: "Use 2-24 letters, numbers, underscores, or hyphens."
    });
  });
});
