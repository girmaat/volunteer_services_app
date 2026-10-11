import type express from "express";
import { requireUserBySession } from "../auth/session";
import { pool } from "../lib/db";

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

export async function requireAuthedUser(req: express.Request, res: express.Response) {
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

  if (user.banned_until) {
    const until = new Date(user.banned_until as any).getTime();
    if (!Number.isNaN(until) && until > Date.now()) {
      res.status(403).json({ message: "Account is banned", banned_until: user.banned_until, banned_reason: (user as any).banned_reason || null });
      return null;
    }
  }

  if (user.banned_until) {
    const until = new Date(user.banned_until as any).getTime();
    if (!Number.isNaN(until) && until > Date.now()) {
      res.status(403).json({ message: "Account is banned", banned_until: user.banned_until, banned_reason: (user as any).banned_reason || null });
      return null;
    }
  }

  if (!user.onboarding_completed) {
    res.status(403).json({ message: "Onboarding incomplete" });
    return null;
  }

  return user;
}

export async function requireVolunteerUser(req: express.Request, res: express.Response) {
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

  if (user.banned_until) {
    const until = new Date(user.banned_until as any).getTime();
    if (!Number.isNaN(until) && until > Date.now()) {
      res.status(403).json({ message: "Account is banned", banned_until: user.banned_until, banned_reason: (user as any).banned_reason || null });
      return null;
    }
  }

  if (user.role !== "volunteer" && user.role !== "requester") {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }

  if (!user.onboarding_completed) {
    res.status(403).json({ message: "Onboarding incomplete" });
    return null;
  }

  return user;
}

export async function requireRequesterUser(req: express.Request, res: express.Response) {
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

  if (user.banned_until) {
    const until = new Date(user.banned_until as any).getTime();
    if (!Number.isNaN(until) && until > Date.now()) {
      res.status(403).json({ message: "Account is banned", banned_until: user.banned_until, banned_reason: (user as any).banned_reason || null });
      return null;
    }
  }

  if (user.role !== "requester") {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }

  if (!user.onboarding_completed) {
    res.status(403).json({ message: "Onboarding incomplete" });
    return null;
  }

  return user;
}

export async function getOptionalAuthedUser(req: express.Request) {
  const token = authHeaderToken(req);
  if (!token) return null;
  const user = await requireUserBySession(pool, token);
  return user || null;
}
