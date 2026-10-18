import type { Express } from "express";
import { isProduction } from "../lib/env";
import { buildOpenApiDocument } from "./document";

/** OpenAPI JSON at /v1/openapi.json and a Redoc viewer at /v1/docs (not in production). */
export function registerDocsRoutes(app: Express) {
  if (isProduction && process.env.EXPOSE_API_DOCS !== "true") return;
  let cached: unknown = null;
  app.get("/v1/openapi.json", (_req, res) => {
    cached ??= buildOpenApiDocument(app);
    res.json(cached);
  });
  app.get("/v1/docs", (_req, res) => {
    res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><title>Volunteer Services API</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><redoc spec-url="/v1/openapi.json"></redoc>
<script src="https://cdn.jsdelivr.net/npm/redoc@2.5.0/bundles/redoc.standalone.js"></script></body></html>`);
  });
}
