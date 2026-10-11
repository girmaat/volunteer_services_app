import type { Express } from "express";
import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  AcceptedResponse,
  ContactRequest,
  EmailOnlyRequest,
  ErrorBody,
  LoginRequest,
  LoginResponse,
  MeResponse,
  PublicOpportunity,
  PublicOpportunityPage,
  PublicOpportunityQuery,
  PublicOrganizationDetail,
  PublicOrganizationPage,
  PublicPageContent,
  ResetPasswordRequest,
  SignupRequest
} from "@thankyou/contracts";

extendZodWithOpenApi(z);

type RouteInfo = { method: string; path: string };

/** Lists every route registered on the Express app (method + path). */
export function listRoutes(app: Express): RouteInfo[] {
  const out: RouteInfo[] = [];
  const stack = (app as unknown as { _router?: { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> } })._router?.stack ?? [];
  for (const layer of stack) {
    if (!layer.route || typeof layer.route.path !== "string") continue;
    for (const m of Object.keys(layer.route.methods)) out.push({ method: m, path: layer.route.path });
  }
  return out;
}

const toOpenApiPath = (p: string) => p.replace(/:([A-Za-z_]+)/g, "{$1}");

function tagFor(path: string) {
  const seg = path.split("/")[2] || "platform";
  return seg === "me" || seg === "onboarding" ? "auth" : seg === "share" ? "shares" : seg;
}

const PUBLIC_PREFIXES = ["/v1/public/", "/v1/health", "/v1/platform/status", "/v1/auth/", "/v1/openapi.json", "/v1/docs", "/v1/orgs/enroll", "/v1/notifications/unsubscribe", "/v1/discovery/"];
export const isPublicPath = (p: string) =>
  PUBLIC_PREFIXES.some((x) => p.startsWith(x)) || /^\/v1\/shares?\/(resolve\/)?:token$/.test(p) || /^\/v1\/shares\/:token\/(events|report)$/.test(p) || p === "/v1/share/events" || p.startsWith("/v1/share/report/") || p.startsWith("/v1/share/resolve/");

export function buildOpenApiDocument(app: Express) {
  const registry = new OpenAPIRegistry();
  registry.registerComponent("securitySchemes", "session", { type: "http", scheme: "bearer", description: "Session token from POST /v1/auth/login" });
  const err = { content: { "application/json": { schema: ErrorBody } } };
  const json = <T extends z.ZodTypeAny>(schema: T, description = "OK") => ({ description, content: { "application/json": { schema } } });

  const documented = new Set<string>();
  const doc = (method: "get" | "post", path: string, def: Record<string, unknown>) => {
    documented.add(`${method} ${path}`);
    registry.registerPath({ method, path: toOpenApiPath(path), tags: [tagFor(path)], ...def } as never);
  };

  doc("get", "/v1/health", { summary: "Liveness and database check", responses: { 200: json(z.object({ status: z.string(), db: z.string() })) } });
  doc("get", "/v1/public/opportunities", { summary: "Open opportunities (redacted, paginated)", request: { query: PublicOpportunityQuery }, responses: { 200: json(PublicOpportunityPage) } });
  doc("get", "/v1/public/opportunities/:id", { summary: "One open opportunity (redacted)", request: { params: z.object({ id: z.string().uuid() }) }, responses: { 200: json(PublicOpportunity), 404: { description: "Not found", ...err } } });
  doc("get", "/v1/public/organizations", { summary: "Organization directory", request: { query: z.object({ q: z.string().optional(), cursor: z.string().optional(), limit: z.number().optional() }) }, responses: { 200: json(PublicOrganizationPage) } });
  doc("get", "/v1/public/organizations/:slug", { summary: "Organization profile", request: { params: z.object({ slug: z.string() }) }, responses: { 200: json(PublicOrganizationDetail), 404: { description: "Not found", ...err } } });
  doc("get", "/v1/public/pages/:slug", { summary: "CMS page content", request: { params: z.object({ slug: z.string() }) }, responses: { 200: json(PublicPageContent) } });
  doc("post", "/v1/public/contact", { summary: "Contact form", request: { body: { content: { "application/json": { schema: ContactRequest } } } }, responses: { 202: json(z.object({ status: z.literal("accepted") }), "Accepted") } });
  doc("post", "/v1/auth/login", { summary: "Log in", request: { body: { content: { "application/json": { schema: LoginRequest } } } }, responses: { 200: json(LoginResponse), 401: { description: "Invalid credentials", ...err }, 429: { description: "Rate limited", ...err } } });
  doc("post", "/v1/auth/signup", { summary: "Create an account", request: { body: { content: { "application/json": { schema: SignupRequest } } } }, responses: { 202: json(AcceptedResponse, "Verification email sent"), 409: { description: "Email in use", ...err } } });
  doc("post", "/v1/auth/forgot-password", { summary: "Request a password reset email (same response whether or not the email exists)", request: { body: { content: { "application/json": { schema: EmailOnlyRequest } } } }, responses: { 202: json(AcceptedResponse, "Accepted") } });
  doc("post", "/v1/auth/resend-verification", { summary: "Resend the verification email", request: { body: { content: { "application/json": { schema: EmailOnlyRequest } } } }, responses: { 202: json(AcceptedResponse, "Accepted") } });
  doc("post", "/v1/auth/reset-password", { summary: "Set a new password with a reset token", request: { body: { content: { "application/json": { schema: ResetPasswordRequest } } } }, responses: { 200: { description: "Password changed" }, 400: { description: "Invalid or expired token", ...err } } });
  doc("get", "/v1/me", { summary: "Current user", security: [{ session: [] }], responses: { 200: json(MeResponse), 401: { description: "Not authenticated", ...err } } });

  // Every other route is listed so the contract is complete; schemas are added as modules migrate.
  for (const r of listRoutes(app)) {
    const method = r.method as "get" | "post";
    if (documented.has(`${method} ${r.path}`) || r.path === "/v1/openapi.json" || r.path === "/v1/docs") continue;
    const params = [...r.path.matchAll(/:([A-Za-z_]+)/g)].map((m) => m[1]);
    registry.registerPath({
      method: r.method as never,
      path: toOpenApiPath(r.path),
      tags: [tagFor(r.path)],
      summary: `${r.method.toUpperCase()} ${r.path}`,
      ...(isPublicPath(r.path) ? {} : { security: [{ session: [] }] }),
      request: params.length ? { params: z.object(Object.fromEntries(params.map((p) => [p, z.string()]))) } : undefined,
      responses: { 200: { description: "OK" }, 400: { description: "Invalid request", ...err }, ...(isPublicPath(r.path) ? {} : { 401: { description: "Not authenticated", ...err }, 403: { description: "Forbidden", ...err } }) }
    });
  }

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: { title: "ThankYou API", version: "1.0.0", description: "Volunteer-services marketplace API. Versioned under /v1." },
    servers: [{ url: "/" }]
  });
}
