import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
const root = resolve(process.cwd());
const dir = join(root, ".local-postgres");
const bin =
  process.env.PG_BIN ||
  (process.platform === "win32"
    ? "C:\\Program Files\\PostgreSQL\\17\\bin"
    : "");
const executable = (name) =>
  bin ? join(bin, name + (process.platform === "win32" ? ".exe" : "")) : name;
const execute = (name, args, extra = {}) => {
  const result = spawnSync(executable(name), args, {
    cwd: root,
    windowsHide: true,
    stdio: "inherit",
    ...extra,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${name} exited with ${result.status}. Install PostgreSQL 17+ or set PG_BIN.`,
    );
};
mkdirSync(dir, { recursive: true });
const access = join(dir, "access.json");
if (!existsSync(access))
  writeFileSync(
    access,
    JSON.stringify({ password: randomBytes(24).toString("hex") }, null, 2),
    { mode: 0o600 },
  );
const { password } = JSON.parse(readFileSync(access, "utf8"));
const data = join(dir, "data");
if (process.argv.includes("--stop")) {
  execute("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  process.exit(0);
}
if (!existsSync(join(data, "PG_VERSION"))) {
  const passfile = join(dir, "init-password");
  writeFileSync(passfile, password, { mode: 0o600 });
  execute("initdb", [
    "-D",
    data,
    "-U",
    "cocoa",
    "--auth=scram-sha-256",
    "--pwfile=" + passfile,
    "--encoding=UTF8",
    "--locale=C",
  ]);
  writeFileSync(
    join(data, "postgresql.auto.conf"),
    "listen_addresses = '127.0.0.1'\nport = 55432\nmax_connections = 60\nshared_buffers = '128MB'\npassword_encryption = 'scram-sha-256'\n",
  );
}
const status = spawnSync(executable("pg_ctl"), ["-D", data, "status"], {
  windowsHide: true,
  stdio: "ignore",
});
if (status.status !== 0)
  execute("pg_ctl", ["-D", data, "-l", join(dir, "server.log"), "-w", "start"]);
const args = [
  "-h",
  "127.0.0.1",
  "-p",
  "55432",
  "-U",
  "cocoa",
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
];
const env = { ...process.env, PGPASSWORD: password };
const exists = spawnSync(
  executable("psql"),
  [...args, "-tAc", "SELECT 1 FROM pg_database WHERE datname='cocoa_local'"],
  { windowsHide: true, encoding: "utf8", env },
);
if (exists.status !== 0)
  throw new Error(
    "Could not connect to the isolated local PostgreSQL cluster.",
  );
if (exists.stdout.trim() !== "1")
  execute("psql", [...args, "-c", "CREATE DATABASE cocoa_local"], { env });
const envfile = join(root, ".env.local");
let content = existsSync(envfile)
  ? readFileSync(envfile, "utf8")
  : "APP_MODE=local\n";
const url = `postgresql://cocoa:${password}@127.0.0.1:55432/cocoa_local`;
if (!/^DATABASE_URL=/m.test(content)) {
  content += "\nDATABASE_URL=" + url + "\nDATABASE_POOL_MAX=10\n";
  writeFileSync(envfile, content, { mode: 0o600 });
}
console.log(
  "Isolated PostgreSQL is ready on 127.0.0.1:55432. Existing system PostgreSQL services were not changed.",
);
