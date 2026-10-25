// Verifies that server-side secrets cannot leak into what browsers download.
// Builds the app with unmistakable sentinel secrets, then searches every client file and rendered page for them.
//   node scripts/check-secrets.mjs      (takes about a minute)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SENTINELS = {
  DATABASE_URL: "postgresql://sentinel_user:SENTINEL_DB_PASSWORD_9f3a@db.sentinel.invalid:5432/postgres",
  ADMIN_SETUP_TOKEN: "SENTINEL_SETUP_TOKEN_7c1e55aa90",
  RESEND_API_KEY: "re_SENTINEL_RESEND_KEY_4d2b",
  CRON_SECRET: "SENTINEL_CRON_SECRET_81ac33ef09",
  JAZZCASH_PASSWORD: "SENTINEL_JAZZCASH_PASSWORD_55",
};
const env = { ...process.env, ...SENTINELS };
const r = spawnSync("npx", ["next", "build"], { env, stdio: "inherit", shell: process.platform === "win32" });
if (r.status !== 0) process.exit(r.status ?? 1);

const needles = Object.values(SENTINELS).flatMap((v) => [v, v.split("@")[0], v.replace(/^.*:\/\//, "")]).filter((v) => v.length > 12);
const hits = [];
const walk = (dir) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(js|css|html|json|map|txt|rsc)$/.test(f.name)) {
      const t = fs.readFileSync(p, "utf8");
      for (const n of needles) if (t.includes(n)) hits.push(`${p} contains ${n.slice(0, 18)}…`);
    }
  }
};
walk(path.join(".next", "static"));
console.log(hits.length ? `LEAK FOUND:\n${hits.join("\n")}` : `OK: no server secret appears in ${path.join(".next", "static")} (client bundles).`);
process.exit(hits.length ? 1 : 0);
