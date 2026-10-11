import fs from "fs";
import { describe, expect, it } from "vitest";
import { listMigrationFiles, MIGRATIONS_DIR } from "../src/db/migrator";

describe("migrations", () => {
  it("are uniquely numbered and sorted", () => {
    const files = listMigrationFiles();
    expect(files.length).toBeGreaterThan(0);
    const ids = files.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
    expect(files[0].name).toBe("0001_baseline");
  });

  it("contain no psql meta-commands (the runner sends plain SQL)", () => {
    for (const f of listMigrationFiles()) {
      const sql = fs.readFileSync(f.file, "utf8");
      expect(sql.split("\n").some((l) => l.startsWith("\\")), f.name).toBe(false);
    }
  });

  it("ignores files that do not match NNNN_name.sql", () => {
    const all = fs.readdirSync(MIGRATIONS_DIR);
    expect(all.filter((f) => f.endsWith(".sql")).length).toBe(listMigrationFiles().length);
  });
});
