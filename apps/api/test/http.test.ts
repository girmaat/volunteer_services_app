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

describe("consistent error bodies", () => {
  it("adds { error: { code, message } } to every error response", async () => {
    const { as, EMAILS } = await import("./helpers");
    const r = await (await as(EMAILS.volunteer)).get("/v1/volunteer/applications/not-a-uuid");
    expect(r.status).toBe(400);
    expect(r.body.error).toMatchObject({ code: "invalid_request" });
    expect(typeof r.body.error.message).toBe("string");
    expect(r.body.message).toBe(r.body.error.message);
    const nf = await (await as(EMAILS.volunteer)).get("/v1/volunteer/applications/00000000-0000-4000-8000-000000000000");
    expect(nf.body.error.code).toBe("not_found");
  });
});
