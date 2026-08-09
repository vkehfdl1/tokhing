import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadLocalSupabaseEnv } from "./local-supabase-env.mjs";

const projectRoot = process.cwd();
const { SUPABASE_DB_URL: databaseUrl } =
  loadLocalSupabaseEnv(projectRoot);
const testDirectory = join(projectRoot, "supabase", "tests");
const testFiles = readdirSync(testDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort();

function runPsql(args) {
  const result = spawnSync("psql", [databaseUrl, "-X", ...args], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout;
}

runPsql([
  "-v",
  "ON_ERROR_STOP=1",
  "-c",
  "create extension if not exists pgtap;",
]);

for (const file of testFiles) {
  const output = runPsql([
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    join(testDirectory, file),
  ]);
  if (/^not ok\b/m.test(output)) {
    process.exit(1);
  }
}
