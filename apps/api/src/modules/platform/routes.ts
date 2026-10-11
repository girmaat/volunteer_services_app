/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { pool } from "../../lib/db";

export function registerPlatformRoutes(app: Express) {

// Health
app.get("/v1/health", async (_req, res) => {
  try {
    const started = Date.now();
    await pool.query("SELECT 1 as ok");
    const ms = Date.now() - started;
    res.json({ status: "ok", db: "ok", dbLatencyMs: ms });
  } catch (e: any) {
    res.status(500).json({ status: "error", db: "error", message: e?.message || "db error" });
  }
});
}
