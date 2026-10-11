import type express from "express";

/**
 * Safe Content-Disposition header for user-supplied file names.
 * Strips control characters, quotes and path separators from the ASCII fallback and adds an
 * RFC 5987 filename* parameter so non-ASCII names survive.
 */
export function contentDisposition(fileName: string | null | undefined, type: "attachment" | "inline" = "attachment"): string {
  const raw = String(fileName || "document").normalize("NFC");
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/]/g, "_").trim() || "document";
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, "_").replace(/["%;]/g, "_").slice(0, 150);
  const encoded = encodeURIComponent(cleaned.slice(0, 150)).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export type AsyncHandler = (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>;

/** Adapts an async route handler so rejected promises reach the central error handler. */
export function wrap(fn: AsyncHandler) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
