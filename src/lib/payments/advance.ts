import type { Queryable } from "@/lib/db";
import { advanceConfigSchema, defaultAdvanceConfig, type AdvanceConfig } from "@/lib/domain/advance";

/** The COD advance rule. Stored in store_settings under 'cod_advance'. Missing or invalid means "off", never a guessed amount. */
export async function getAdvanceConfig(db: Queryable): Promise<AdvanceConfig> {
  const rows = await db.query<{ value: unknown }>("select value from store_settings where key = 'cod_advance'");
  const parsed = advanceConfigSchema.safeParse(rows[0]?.value);
  return parsed.success ? parsed.data : defaultAdvanceConfig();
}

export async function saveAdvanceConfig(db: Queryable, cfg: AdvanceConfig): Promise<void> {
  await db.query(
    `insert into store_settings(key, value) values ('cod_advance', $1)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(advanceConfigSchema.parse(cfg))],
  );
}
