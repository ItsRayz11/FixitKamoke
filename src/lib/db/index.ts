import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import type { Db, Queryable } from "./types";
import { migrate } from "./migrate";

export type { Db, Queryable } from "./types";

/** Embedded Postgres (PGlite). In-memory when dataDir is omitted. Used for local dev and tests. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  const wrap = (q: { query: PGlite["query"]; exec: PGlite["exec"] }): Queryable => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await q.query(sql, params as never[]);
      return r.rows as T[];
    },
    async exec(sql: string) {
      await q.exec(sql);
    },
  });
  return {
    ...wrap(pg),
    tx: (fn) => pg.transaction((t) => fn(wrap(t as never))),
    close: () => pg.close(),
  };
}

/** Real Postgres (Supabase, Neon, any). Uses DATABASE_URL. */
export async function createPostgresDb(url: string): Promise<Db> {
  const postgres = (await import("postgres")).default;
  // Pool size is configurable: serverless hosts usually want a small pool (they open many instances).
  const sql = postgres(url, {
    max: Math.max(1, Number(process.env.DATABASE_POOL_MAX) || 5),
    prepare: false,
    // All callers pass JSON as an already-serialised string (as the embedded driver expects). By default this driver would
    // JSON.stringify that string a second time and store an escaped string instead of an object. Pass strings through as-is.
    types: {
      json: {
        to: 114,
        from: [114, 3802],
        serialize: (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x)),
        parse: (x: string) => JSON.parse(x),
      },
    },
  });
  const wrap = (s: typeof sql): Queryable => ({
    async query<T>(text: string, params: unknown[] = []) {
      return (await s.unsafe(text, params as never[])) as unknown as T[];
    },
    async exec(text: string) {
      await s.unsafe(text);
    },
  });
  return {
    ...wrap(sql),
    tx: (fn) => sql.begin((t) => fn(wrap(t as unknown as typeof sql))) as never,
    close: () => sql.end(),
  };
}

const g = globalThis as unknown as { __fixitDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  g.__fixitDb ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (url) return createPostgresDb(url);
    if (process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_URL is required in production");
    }
    // FIXIT_PGLITE_DIR=memory:// gives a throwaway database (used by end-to-end tests).
    const db = await createPgliteDb(process.env.FIXIT_PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"));
    await migrate(db);
    return db;
  })();
  return g.__fixitDb;
}
