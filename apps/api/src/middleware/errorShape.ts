import type { NextFunction, Request, Response } from "express";

const CODES: Record<number, string> = {
  400: "invalid_request",
  401: "not_authenticated",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  410: "gone",
  413: "too_large",
  422: "unprocessable",
  429: "rate_limited",
  503: "unavailable"
};

/**
 * Every error response has the same shape: { error: { code, message, details? }, message, requestId }.
 * Older handlers that send { message } get the `error` object added here, so clients can rely on it.
 */
export function errorShape(_req: Request, res: Response, next: NextFunction) {
  const json = res.json.bind(res);
  res.json = (body?: unknown) => {
    if (res.statusCode >= 400 && body && typeof body === "object" && !Array.isArray(body) && !("error" in (body as object) && typeof (body as { error: unknown }).error === "object")) {
      const b = body as Record<string, unknown>;
      const message = typeof b.message === "string" ? b.message : typeof b.error === "string" ? b.error : "Request failed";
      const { message: _m, errors, error: _e, ...rest } = b;
      void _m;
      void _e;
      const requestId = res.getHeader("x-request-id");
      return json({
        error: { code: CODES[res.statusCode] ?? "error", message, ...(errors ? { details: errors } : {}) },
        message,
        ...(errors ? { errors } : {}),
        ...rest,
        ...(requestId ? { requestId: String(requestId) } : {})
      });
    }
    return json(body);
  };
  next();
}
