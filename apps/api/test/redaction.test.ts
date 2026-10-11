import { describe, expect, it } from "vitest";
import { derivePublicLocation, looksPreciseLocation, sanitizePublicDescription } from "../src/lib/redaction";

describe("public redaction", () => {
  it("removes emails, phone numbers and street addresses", () => {
    const out = sanitizePublicDescription("Email jo@ex.com or call (212) 555-0199. Meet at 123 Main Street, apt 4.");
    expect(out).not.toMatch(/jo@ex\.com|555-0199|123 Main Street/);
    expect(out).toContain("[redacted email]");
    expect(out).toContain("[redacted phone]");
  });

  it("reduces locations to city level and never leaks a street address", () => {
    expect(derivePublicLocation("remote", "anything", null)).toBe("Remote");
    expect(derivePublicLocation("in-person", "Queens, NY", null)).toBe("Queens, NY");
    expect(derivePublicLocation("in-person", "Riverside Park, Manhattan, NY", null)).toBe("Manhattan, NY");
    expect(derivePublicLocation("in-person", "123 Main St, Springfield, IL 62701", null)).toBe("Springfield, IL");
    expect(derivePublicLocation("hybrid", "55 Water St", "Brooklyn, NY")).toBe("Brooklyn, NY");
    expect(derivePublicLocation("in-person", "55 Water St", null)).toBe("Location shared after you apply");
  });

  it("flags precise-looking locations", () => {
    expect(looksPreciseLocation("12 Oak Avenue")).toBe(true);
    expect(looksPreciseLocation("Hoboken, NJ")).toBe(false);
  });
});
