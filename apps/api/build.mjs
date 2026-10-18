// Production build: bundles the API (and workspace packages such as @volunteer_services_app/contracts) into dist/.
// Third-party dependencies stay external and are installed in the runtime image.
import { build } from "esbuild";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const external = Object.keys(pkg.dependencies || {}).filter((d) => !d.startsWith("@volunteer_services_app/"));

await build({
  entryPoints: { server: "src/server.ts", "migrate-cli": "src/db/migrate-cli.ts", seed: "src/db/seed.ts" },
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  external: [...external, "pino-pretty"],
  logLevel: "info"
});
