import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "./logger";
import { isProduction } from "./env";

/** Throw from any handler to return a typed error response. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, "bad_request", message, details);
export const unauthorized = (message = "Not authenticated") => new AppError(401, "unauthorized", message);
export const forbidden = (message = "Forbidden") => new AppError(403, "forbidden", message);
export const notFound = (message = "Not found") => new AppError(404, "not_found", message);
export const conflict = (message: string) => new AppError(409, "conflict", message);

/**
 * Error body: { error: { code, message, details? }, message }.
 * The top-level "message" is kept for compatibility with existing web pages.
 */
function body(code: string, message: string, details?: unknown, requestId?: string) {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) }, message, ...(requestId ? { requestId } : {}) };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(body("not_found", `No route for ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = (req as { id?: string }).id;
  if (res.headersSent) return;

  if (err instanceof AppError) {
    res.status(err.status).json(body(err.code, err.message, err.details, requestId));
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json(body("invalid_payload", "Invalid payload", err.flatten(), requestId));
    return;
  }
  // body-parser errors
  const status = typeof err?.status === "number" ? err.status : typeof err?.statusCode === "number" ? err.statusCode : 500;
  if (status === 413) {
    res.status(413).json(body("payload_too_large", "Request body too large", undefined, requestId));
    return;
  }
  if (status === 400 && err?.type === "entity.parse.failed") {
    res.status(400).json(body("invalid_json", "Malformed JSON body", undefined, requestId));
    return;
  }
  // Postgres constraint errors are client errors (bad reference / duplicate), not server faults.
  const pgCode = typeof err?.code === "string" ? err.code : "";
  if (pgCode === "23503") {
    res.status(404).json(body("reference_not_found", "A referenced record does not exist", undefined, requestId));
    return;
  }
  if (pgCode === "23505") {
    res.status(409).json(body("conflict", "That record already exists", undefined, requestId));
    return;
  }
  if (pgCode === "22P02" || pgCode === "22007" || pgCode === "22008") {
    res.status(400).json(body("invalid_value", "Invalid value in request", undefined, requestId));
    return;
  }
  if (err?.name === "MulterError") {
    res.status(400).json(body("upload_rejected", String(err.message || "Upload rejected"), undefined, requestId));
    return;
  }

  logger.error({ err, requestId, method: req.method, path: req.path }, "unhandled error");
  res
    .status(500)
    .json(body("internal_error", "Internal server error", isProduction ? undefined : String(err?.message || err), requestId));
};
