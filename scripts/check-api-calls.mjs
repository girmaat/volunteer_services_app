#!/usr/bin/env node
// Fails when the web app calls an API route that doesn't exist (method + path).
// Static check: finds `/v1/...` paths in apps/web and Express routes in apps/api.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", "dist"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
};

const routes = [];
for (const f of walk(path.join(root, "apps/api/src"))) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/app\.(get|post|put|patch|delete)\(\s*"(\/v1\/[^"]+)"/g)) routes.push([m[1].toUpperCase(), m[2].replace(/:[A-Za-z_]+/g, "*")]);
}

const calls = [];
for (const f of walk(path.join(root, "apps/web"))) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/(?:backendFetch|fetch)\(\s*[`"](?:\$\{[^}]*\})?(\/v1\/[^`"?]+)/g)) {
    const call = s.slice(m.index, m.index + 400).split(/\n\s*\n/)[0];
    const opts = call.match(/method:\s*([^,}\n]+)/);
    if (opts && !/^"[A-Z]+"$/.test(opts[1].trim())) continue; // method chosen at runtime
    const method = opts ? opts[1].trim().slice(1, -1) : /\bmethod\b/.test(call.slice(0, 200)) ? null : "GET";
    if (!method) continue;
    const p = m[1].replace(/\$\{[^}]+\}/g, "*").replace(/\/$/, "");
    if (p.includes("${")) continue; // built from a template we can't resolve statically
    calls.push([method, p, path.relative(root, f)]);
  }
}

const matches = (method, p) =>
  routes.some(([m, r]) => {
    if (m !== method) return false;
    const a = r.split("/"), b = p.split("/");
    return a.length === b.length && a.every((x, i) => x === "*" || b[i] === "*" || x === b[i]);
  });

const missing = calls.filter(([m, p]) => !matches(m, p));
for (const [m, p, f] of missing) console.log(`${m} ${p}  (${f})`);
console.log(`${calls.length} API calls checked, ${missing.length} without a matching route.`);
process.exit(missing.length ? 1 : 0);
