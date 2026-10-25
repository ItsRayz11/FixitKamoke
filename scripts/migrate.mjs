// Production migration runner: `DATABASE_URL=... npm run db:migrate`
// Applies db/migrations/*.sql in order, once each, each inside a transaction.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const dir = path.join(process.cwd(), "db", "migrations");
const sql = postgres(url, { max: 1, prepare: false });

try {
  await sql.unsafe("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    await sql.begin(async (tx) => {
      await tx.unsafe(fs.readFileSync(path.join(dir, file), "utf8"));
      await tx`insert into schema_migrations(name) values (${file})`;
    });
    console.log("applied", file);
  }
  console.log("migrations up to date");
} finally {
  await sql.end();
}
