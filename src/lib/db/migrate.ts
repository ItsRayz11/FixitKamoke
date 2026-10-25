import fs from "node:fs";
import path from "node:path";
import type { Db } from "./types";

/**
 * Applies db/migrations/*.sql in filename order, once each. Used by local dev and tests.
 * Production applies the same files with `npm run db:migrate` (scripts/migrate.mjs).
 */
export async function migrate(db: Db): Promise<string[]> {
  await db.exec(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set((await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name));
  const applied: string[] = [];
  const files = fs.readdirSync(path.join(process.cwd(), "db", "migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(process.cwd(), "db", "migrations", file), "utf8");
    await db.tx(async (q) => {
      await q.exec(sql);
      await q.query("insert into schema_migrations(name) values ($1)", [file]);
    });
    applied.push(file);
  }
  return applied;
}
