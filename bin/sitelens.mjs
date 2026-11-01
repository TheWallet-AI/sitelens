#!/usr/bin/env node
// SiteLens command line: `sitelens audit <url> [options]`. See `src/cli/main.ts` for options and exit codes.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  process.execPath,
  ["--experimental-transform-types", "--no-warnings", "--import", join(root, "scripts/cli-register.mjs"), join(root, "src/cli/main.ts"), ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status ?? 3);
