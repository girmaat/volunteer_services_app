import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { pool } from "./helpers";

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : []));
}

/** Guards against INSERT ... ON CONFLICT (cols) clauses with no matching unique index (a runtime 500). */
describe("ON CONFLICT targets match a unique index", () => {
  it("every upsert in src has a matching unique index or constraint", async () => {
    const r = await pool.query<{ tablename: string; indexdef: string }>(
      "SELECT tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexdef LIKE 'CREATE UNIQUE%'"
    );
    const uniq = new Map<string, { cols: string[]; partial: boolean }[]>();
    for (const row of r.rows) {
      const m = row.indexdef.match(/\(([^)]*)\)( WHERE .*)?$/);
      if (!m) continue;
      const list = uniq.get(row.tablename) ?? [];
      list.push({ cols: m[1].split(",").map((c) => c.trim()), partial: Boolean(m[2]) });
      uniq.set(row.tablename, list);
    }
    const problems: string[] = [];
    for (const file of walk(path.resolve(__dirname, "../src"))) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(/ON CONFLICT\s*\(([^)]*)\)(\s*WHERE)?/g)) {
        const before = src.slice(0, m.index);
        const ins = [...before.matchAll(/INSERT INTO\s+(?:public\.)?(\w+)/g)].pop();
        if (!ins) continue;
        const table = ins[1];
        const cols = m[1].split(",").map((c) => c.trim()).sort().join(",");
        const hasWhere = Boolean(m[2]);
        const ok = (uniq.get(table) ?? []).some((u) => [...u.cols].sort().join(",") === cols && (u.partial === hasWhere || !u.partial));
        if (!ok) problems.push(`${path.relative(process.cwd(), file)}: ${table}(${cols})${hasWhere ? " WHERE" : ""}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
