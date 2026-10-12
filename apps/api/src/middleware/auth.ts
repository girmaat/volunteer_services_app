import { isBanned } from "../lib/ban";
import type express from "express";
import { requireUserBySession } from "../auth/session";
import { pool } from "../lib/db";
import { can, type Action } from "../lib/policy";

export function authHeaderToken(req: express.Request): string | null {
  const header = req.header("authorization") || "";
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") return parts[1];
  return null;
}

export async function optionalAuthedUser(req: express.Request) {
  const token = authHeaderToken(req);
  if (!token) return null;
  try {
    const user = await requireUserBySession(pool, token);
    return user || null;
  } catch {
    return null;
  }
}

export const getOptionalAuthedUser = optionalAuthedUser;

type Opts = { allowIncompleteOnboarding?: boolean };

/** Session + ban + onboarding checks shared by every guard. Sends the error response and returns null on failure. */
async function authenticate(req: express.Request, res: express.Response, opts: Opts = {}) {
  const token = authHeaderToken(req);
  if (!token) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  const user = await requireUserBySession(pool, token);
  if (!user) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }
  if (isBanned(user)) {
    res.status(403).json({ message: "Account is banned", banned_until: user.banned_until, banned_reason: (user as any).banned_reason || null });
    return null;
  }
  if (!opts.allowIncompleteOnboarding && !user.onboarding_completed) {
    res.status(403).json({ message: "Onboarding incomplete" });
    return null;
  }
  return user;
}

export async function requireAuthedUser(req: express.Request, res: express.Response) {
  return authenticate(req, res);
}

/** Requires a policy action. `legacyRole` pins `user.role` for handlers that still read it. */
export async function requireCan(req: express.Request, res: express.Response, action: Action, legacyRole?: string) {
  const user = await authenticate(req, res);
  if (!user) return null;
  if (!can(user, action)) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  if (legacyRole) user.role = legacyRole;
  return user;
}

/** Volunteer area: the account must hold the volunteer role. */
export function requireVolunteerUser(req: express.Request, res: express.Response) {
  return requireCan(req, res, "volunteer:act", "volunteer");
}

/** Requester area: the account must hold the requester role. */
export function requireRequesterUser(req: express.Request, res: express.Response) {
  return requireCan(req, res, "requester:act", "requester");
}
