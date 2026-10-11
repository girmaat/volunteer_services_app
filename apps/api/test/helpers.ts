import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app";
import { pool } from "../src/lib/db";

export const PASSWORD = "Test-Password-123!";
export const EMAILS = {
  admin: "admin@thankyou.test",
  orgAdmin: "org.admin@thankyou.test",
  orgMember: "org.member@thankyou.test",
  volunteer: "volunteer.local@thankyou.test",
  remoteVolunteer: "volunteer.remote@thankyou.test",
  requester: "requester@thankyou.test",
  dual: "dual.role@thankyou.test"
} as const;

let app: Express | null = null;
export function getApp() {
  app ??= createApp();
  return app;
}

const tokens = new Map<string, string>();
export async function tokenFor(email: string): Promise<string> {
  const cached = tokens.get(email);
  if (cached) return cached;
  const res = await request(getApp()).post("/v1/auth/login").send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  tokens.set(email, res.body.sessionToken);
  return res.body.sessionToken;
}

/** Authenticated supertest helpers. */
export async function as(email: string) {
  const t = await tokenFor(email);
  const a = getApp();
  return {
    get: (p: string) => request(a).get(p).set("authorization", `Bearer ${t}`),
    post: (p: string, body?: object) => request(a).post(p).set("authorization", `Bearer ${t}`).send(body ?? {}),
    put: (p: string, body?: object) => request(a).put(p).set("authorization", `Bearer ${t}`).send(body ?? {}),
    patch: (p: string, body?: object) => request(a).patch(p).set("authorization", `Bearer ${t}`).send(body ?? {}),
    del: (p: string) => request(a).delete(p).set("authorization", `Bearer ${t}`)
  };
}

export const anon = () => request(getApp());

export async function userId(email: string): Promise<string> {
  const r = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  return String(r.rows[0].id);
}

export { pool };
