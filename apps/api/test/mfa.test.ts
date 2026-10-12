/**
 * Two-step sign-in (SAFE-05): setup, sign-in with a code, replay and brute-force refusals, recovery
 * codes, turning it off, and the staff requirement.
 */
import { afterEach, describe, expect, it } from "vitest";
import { anon, createUser, PASSWORD, pool, userId } from "./helpers";
import { currentStep, hotp } from "../src/lib/totp";
import { uniq } from "./pilot-helpers";

const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
async function login(email: string) {
  return anon().post("/v1/auth/login").send({ email, password: PASSWORD });
}
async function signedIn(email: string) {
  const r = await login(email);
  expect(r.status).toBe(200);
  return String(r.body.sessionToken);
}
/** Turns two-step on and returns the secret and recovery codes. */
async function enable(token: string) {
  expect((await anon().post("/v1/me/mfa/setup").set(bearer(token)).send({ password: "wrong" })).status).toBe(403);
  const setup = await anon().post("/v1/me/mfa/setup").set(bearer(token)).send({ password: PASSWORD });
  expect(setup.status).toBe(200);
  expect(setup.body.otpauth_url).toMatch(/^otpauth:\/\/totp\/ThankYou%3A.+\?secret=[A-Z2-7]+&issuer=ThankYou/);
  const secret = String(setup.body.secret);
  expect((await anon().post("/v1/me/mfa/enable").set(bearer(token)).send({ code: "000000" })).status).toBe(422);
  // A code from the previous step, so the next sign-in can use the current one.
  const on = await anon().post("/v1/me/mfa/enable").set(bearer(token)).send({ code: hotp(secret, currentStep() - 1) });
  expect(on.status, JSON.stringify(on.body)).toBe(200);
  expect(on.body.recovery_codes).toHaveLength(10);
  return { secret, codes: on.body.recovery_codes as string[] };
}

afterEach(() => {
  delete process.env.MFA_REQUIRED_FOR_STAFF;
});

describe("two-step sign-in", () => {
  it("asks for a code after the password, refuses wrong and replayed codes, and signs in with a good one", async () => {
    const email = `${uniq("mfa")}@thankyou.test`;
    await createUser({ email, roles: ["volunteer"] });
    const first = await signedIn(email);
    const other = await signedIn(email);
    const { secret } = await enable(first);
    // Turning it on signs out other devices.
    expect((await anon().get("/v1/me").set(bearer(other))).status).toBe(401);
    expect((await anon().get("/v1/me").set(bearer(first))).body.user.mfa_enabled).toBe(true);

    const step1 = await login(email);
    expect(step1.body).toMatchObject({ mfa_required: true });
    expect(step1.body.sessionToken).toBeUndefined();
    const t = String(step1.body.mfa_token);
    expect((await anon().post("/v1/auth/mfa").send({ mfaToken: t, code: "123456" })).status).toBe(401);
    const code = hotp(secret, currentStep());
    const ok = await anon().post("/v1/auth/mfa").send({ mfaToken: t, code });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.sessionToken).toBeTruthy();
    // The challenge is single-use, and the same code can't sign in again.
    expect((await anon().post("/v1/auth/mfa").send({ mfaToken: t, code })).body.error.code).toBe("mfa_expired");
    const again = await login(email);
    expect((await anon().post("/v1/auth/mfa").send({ mfaToken: again.body.mfa_token, code })).status).toBe(401);
  });

  it("locks a challenge after five wrong codes", async () => {
    const email = `${uniq("mfa-lock")}@thankyou.test`;
    await createUser({ email, roles: ["volunteer"] });
    const { secret } = await enable(await signedIn(email));
    const t = (await login(email)).body.mfa_token;
    for (let i = 0; i < 5; i++) await anon().post("/v1/auth/mfa").send({ mfaToken: t, code: "000000" });
    const late = await anon().post("/v1/auth/mfa").send({ mfaToken: t, code: hotp(secret, currentStep()) });
    expect(late.status).toBe(401);
    expect(late.body.error.code).toBe("mfa_expired");
  });

  it("a recovery code works once, and turning it off needs the password and a code", async () => {
    const email = `${uniq("mfa-rec")}@thankyou.test`;
    await createUser({ email, roles: ["volunteer"] });
    const { codes } = await enable(await signedIn(email));
    const r1 = await anon().post("/v1/auth/mfa").send({ mfaToken: (await login(email)).body.mfa_token, code: codes[0].toUpperCase() });
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ used_recovery_code: true, recovery_codes_left: 9 });
    expect((await anon().post("/v1/auth/mfa").send({ mfaToken: (await login(email)).body.mfa_token, code: codes[0] })).status).toBe(401);
    const s = String(r1.body.sessionToken);
    expect((await anon().post("/v1/me/mfa/disable").set(bearer(s)).send({ password: PASSWORD, code: "000000" })).status).toBe(422);
    expect((await anon().post("/v1/me/mfa/disable").set(bearer(s)).send({ password: PASSWORD, code: codes[1] })).body.enabled).toBe(false);
    expect((await login(email)).body.sessionToken).toBeTruthy();
    const stored = await pool.query("SELECT mfa_secret FROM users WHERE id = $1", [await userId(email)]);
    expect(stored.rows[0].mfa_secret).toBeNull();
  });

  it("stores the secret encrypted, never as the plain code seed", async () => {
    const email = `${uniq("mfa-enc")}@thankyou.test`;
    await createUser({ email, roles: ["volunteer"] });
    const { secret } = await enable(await signedIn(email));
    const row = (await pool.query("SELECT mfa_secret FROM users WHERE id = $1", [await userId(email)])).rows[0];
    expect(String(row.mfa_secret)).toMatch(/^v1:/);
    expect(String(row.mfa_secret)).not.toContain(secret);
  });

  it("platform staff can't use admin tools without it when it's required", async () => {
    const email = `${uniq("staff")}@thankyou.test`;
    await createUser({ email, roles: ["volunteer"] });
    await pool.query("INSERT INTO platform_admins (user_id, role) VALUES ($1, 'admin')", [await userId(email)]);
    const t = await signedIn(email);
    expect((await anon().get("/v1/admin/organizations").set(bearer(t))).status).toBe(200);
    process.env.MFA_REQUIRED_FOR_STAFF = "true";
    const no = await anon().get("/v1/admin/organizations").set(bearer(t));
    expect(no.status).toBe(403);
    expect(no.body.error.code).toBe("mfa_required");
    const { secret } = await enable(t);
    const s2 = await anon().post("/v1/auth/mfa").send({ mfaToken: (await login(email)).body.mfa_token, code: hotp(secret, currentStep()) });
    expect((await anon().get("/v1/admin/organizations").set(bearer(s2.body.sessionToken))).status).toBe(200);
  });
});
