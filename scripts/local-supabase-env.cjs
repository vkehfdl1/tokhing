const { execFileSync, spawnSync } = require("node:child_process");

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/**
 * @param {string} output
 * @returns {Readonly<Record<string, string>>}
 */
function parseStatusOutput(output) {
  /** @type {Record<string, string>} */
  const values = {};

  for (const line of output.split("\n")) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const key = line.slice(0, separator);
    const rawValue = line.slice(separator + 1);
    values[key] =
      rawValue.startsWith('"') && rawValue.endsWith('"')
        ? JSON.parse(rawValue)
        : rawValue;
  }

  return values;
}

/**
 * @param {string | undefined} value
 * @param {string} label
 */
function assertLoopbackUrl(value, label) {
  if (!value) {
    throw new Error(`${label}가 로컬 Supabase 상태에 없습니다.`);
  }

  const hostname = new URL(value).hostname;
  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new Error(
      `${label}는 로컬 주소여야 합니다. 감지된 호스트: ${hostname}`,
    );
  }

  return value;
}

/**
 * @param {string} [cwd]
 * @returns {Readonly<Record<string, string>>}
 */
function loadLocalSupabaseEnv(cwd = process.cwd()) {
  const output = execFileSync("supabase", ["status", "-o", "env"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const status = parseStatusOutput(output);
  const apiUrl = assertLoopbackUrl(status.API_URL, "API_URL");
  const dbUrl = assertLoopbackUrl(status.DB_URL, "DB_URL");
  const anonKey = status.ANON_KEY ?? status.PUBLISHABLE_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;

  if (!anonKey || !serviceRoleKey) {
    throw new Error("로컬 Supabase 인증 키를 찾을 수 없습니다.");
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    SUPABASE_DB_URL: dbUrl,
    DATABASE_URL: dbUrl,
    SUPABASE_LOCAL_ONLY: "1",
  };
}

/**
 * @param {string} command
 * @param {readonly string[]} args
 * @returns {never}
 */
function runCommand(command, args) {
  const localEnv = loadLocalSupabaseEnv();
  const childEnv = {
    ...process.env,
    ...localEnv,
    NEXT_PUBLIC_ADMIN_PASSWORD_HASH: "",
  };
  delete childEnv.NO_COLOR;

  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: childEnv,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

if (require.main === module) {
  const [, , command, ...args] = process.argv;
  if (!command) {
    throw new Error("실행할 로컬 명령이 필요합니다.");
  }
  runCommand(command, args);
}

module.exports = {
  loadLocalSupabaseEnv,
};
