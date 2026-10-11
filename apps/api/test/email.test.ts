import { afterEach, describe, expect, it, vi } from "vitest";
import { devEmailLink } from "../src/auth/email";

afterEach(() => vi.unstubAllEnvs());

describe("devEmailLink (account-takeover guard)", () => {
  it("never returns a link in production, even when enabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_EMAIL_LINKS", "true");
    expect(devEmailLink("http://x/reset?t=1", "failed")).toBeUndefined();
    expect(devEmailLink("http://x/reset?t=1", "logged")).toBeUndefined();
  });

  it("returns nothing in development unless DEV_EMAIL_LINKS=true", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_EMAIL_LINKS", "");
    expect(devEmailLink("http://x/reset?t=1", "logged")).toBeUndefined();
  });

  it("returns the link in development when enabled and nothing was sent", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_EMAIL_LINKS", "true");
    expect(devEmailLink("http://x/reset?t=1", "logged")).toBe("http://x/reset?t=1");
    expect(devEmailLink("http://x/reset?t=1", "smtp")).toBeUndefined();
  });
});
