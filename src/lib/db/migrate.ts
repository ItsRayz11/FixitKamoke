import fs from "node:fs";
import path from "node:path";
import type { Db } from "./types";

export async function migrate(db: Db, dir = path.join(process.cwd(), "db", "migrations")): Promise<string[]> {
  await db.exec(
    "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const done = new Set((await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name));
  const applied: string[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await db.tx(async (q) => {
      await q.exec(sql);
      await q.query("insert into schema_migrations(name) values ($1)", [file]);
    });
    applied.push(file);
  }
  return applied;
}
