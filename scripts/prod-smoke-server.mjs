// Starts the PRODUCTION build against a real Postgres wire connection, for end-to-end checks without a hosted database.
//   1. serves an in-memory PGlite over a Postgres socket (so the real `postgres` driver code path is used)
//   2. applies migrations with the real `npm run db:migrate` script
//   3. runs `next start` in production mode with no demo/test switches
// Requires `npm run build` first. Used by playwright.prod.config.ts. Not for real deployments.
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const DB_PORT = 54329;
const APP_PORT = Number(process.env.PORT ?? 3200);

const db = await PGlite.create();
const pg = new PGLiteSocketServer({ db, port: DB_PORT, host: "127.0.0.1" });
await pg.start();

const env = {
  ...process.env,
  DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`,
  SITE_URL: `http://localhost:${APP_PORT}`,
  ADMIN_SETUP_TOKEN: "prod-smoke-setup-token-0123456789",
  NODE_ENV: "production",
  DATABASE_POOL_MAX: "1", // the embedded Postgres socket serves one connection at a time
};
// Make sure nothing test-only leaks in.
for (const k of ["NEXT_PUBLIC_DEMO_MODE", "FIXIT_PGLITE_DIR", "RATE_LIMIT_MULTIPLIER", "MAINTENANCE_MODE"]) delete env[k];

const run = (cmd, args) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { env, stdio: "inherit", shell: process.platform === "win32" });
  p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${c}`))));
});

await run("node", ["scripts/migrate.mjs"]);
const app = spawn("npx", ["next", "start", "-p", String(APP_PORT)], { env, stdio: "inherit", shell: process.platform === "win32" });

const stop = async () => { app.kill(); await pg.stop().catch(() => {}); await db.close().catch(() => {}); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
app.on("exit", stop);
