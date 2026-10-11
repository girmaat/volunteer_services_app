import { describe, expect, it } from "vitest";
import { contentDisposition } from "../src/lib/http";

describe("contentDisposition", () => {
  it("strips quotes, CR/LF and path separators", () => {
    const h = contentDisposition('evil"\r\nSet-Cookie: x=1/..\\a.pdf');
    expect(h).not.toMatch(/[\r\n]/);
    expect(h.split(";")[1]).not.toContain('\\');
    expect(h).toMatch(/^attachment; filename="[^"]*"; filename\*=UTF-8''/);
  });
  it("keeps unicode names in filename*", () => {
    expect(contentDisposition("résumé.pdf")).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9.pdf");
  });
  it("defaults to document", () => {
    expect(contentDisposition(null)).toContain('filename="document"');
  });
});
