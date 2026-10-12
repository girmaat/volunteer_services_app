import { describe, expect, it } from "vitest";
import { anon, PASSWORD, pool } from "./helpers";

describe("authentication", () => {
  const email = `new.user.${Date.now()}@example.com`;

  it("signs up, verifies email via the dev link, logs in, reads /me, logs out", async () => {
    const signup = await anon().post("/v1/auth/signup").send({ email, password: "A-good-password-1", fullName: "New User", birthDate: "1995-03-14" });
    expect(signup.status).toBe(202);
    expect(signup.body.dev_verify_url).toMatch(/\/verify-email\?token=/);

    const beforeVerify = await anon().post("/v1/auth/login").send({ email, password: "A-good-password-1" });
    expect(beforeVerify.status).toBe(403);

    const token = new URL(signup.body.dev_verify_url).searchParams.get("token");
    const verify = await anon().get(`/v1/auth/verify-email?token=${token}`);
    expect(verify.status).toBeLessThan(400);

    const login = await anon().post("/v1/auth/login").send({ email, password: "A-good-password-1" });
    expect(login.status).toBe(200);
    const session = login.body.sessionToken;

    const me = await anon().get("/v1/me").set("authorization", `Bearer ${session}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.user).not.toHaveProperty("password_hash");
    expect(me.body.user).not.toHaveProperty("verification_notes");

    const logout = await anon().post("/v1/auth/logout").set("authorization", `Bearer ${session}`);
    expect(logout.status).toBeLessThan(300);
    expect((await anon().get("/v1/me").set("authorization", `Bearer ${session}`)).status).toBe(401);
  });

  it("rejects wrong passwords with a generic message", async () => {
    const res = await anon().post("/v1/auth/login").send({ email: "requester@thankyou.test", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
    const unknown = await anon().post("/v1/auth/login").send({ email: "nobody@example.com", password: "wrong" });
    expect(unknown.body.message).toBe("Invalid email or password");
  });

  it("forgot-password responds identically for known and unknown emails", async () => {
    process.env.DEV_EMAIL_LINKS = "false";
    const known = await anon().post("/v1/auth/forgot-password").send({ email: "requester@thankyou.test" });
    const unknown = await anon().post("/v1/auth/forgot-password").send({ email: "nobody@example.com" });
    process.env.DEV_EMAIL_LINKS = "true";
    expect(known.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect(JSON.stringify(known.body)).not.toMatch(/reset/i);
  });

  it("resets a password with a valid token and revokes other sessions", async () => {
    const victim = "volunteer.remote@thankyou.test";
    const login = await anon().post("/v1/auth/login").send({ email: victim, password: PASSWORD });
    const oldSession = login.body.sessionToken;
    const fp = await anon().post("/v1/auth/forgot-password").send({ email: victim });
    const token = new URL(fp.body.dev_reset_url).searchParams.get("token");
    const reset = await anon().post("/v1/auth/reset-password").send({ token, password: PASSWORD });
    expect(reset.status).toBeLessThan(300);
    expect((await anon().get("/v1/me").set("authorization", `Bearer ${oldSession}`)).status).toBe(401);
    const reused = await anon().post("/v1/auth/reset-password").send({ token, password: PASSWORD });
    expect(reused.status).toBe(400);
  });

  it("treats malformed session tokens as unauthenticated (not a server error)", async () => {
    const res = await anon().get("/v1/me").set("authorization", "Bearer not-a-uuid");
    expect(res.status).toBe(401);
  });

  it("blocks banned users", async () => {
    const r = await pool.query("UPDATE users SET banned_until = NOW() + INTERVAL '1 day' WHERE email = 'dual.role@thankyou.test' RETURNING id");
    const login = await anon().post("/v1/auth/login").send({ email: "dual.role@thankyou.test", password: PASSWORD });
    const session = login.body.sessionToken;
    const res = session ? await anon().get("/v1/volunteer/dashboard").set("authorization", `Bearer ${session}`) : login;
    expect([401, 403]).toContain(res.status);
    await pool.query("UPDATE users SET banned_until = NULL WHERE id = $1", [r.rows[0].id]);
  });
});
