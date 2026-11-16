/**
 * One-time move to a new server: copy every row from the old database into this one.
 *
 * Set OLD_DATABASE_URL on the new site (the old database's External Database URL) and deploy. On
 * start-up this copies all users, cards, balances, settings and saved keys across, once — then it
 * does nothing on later starts (it leaves a marker). Remove OLD_DATABASE_URL afterwards.
 * Saved keys only stay readable if SESSION_SECRET is the same as on the old site.
 *
 *   npx tsx scripts/copy-from-old-db.ts
 */
import "dotenv/config";
import { Client } from "pg";

const MARKER = "migration.copiedFrom";

function client(url: string) {
  // Render's internal addresses (and this computer) have no SSL; external database URLs need it.
  const host = new URL(url).hostname;
  const local = !host.includes(".") || host === "localhost" || host === "127.0.0.1";
  return new Client({ connectionString: url, ssl: local ? undefined : { rejectUnauthorized: false } });
}

async function main() {
  const oldUrl = process.env.OLD_DATABASE_URL?.trim();
  const newUrl = process.env.DATABASE_URL;
  if (!oldUrl) return; // nothing to do on normal starts
  if (!newUrl) throw new Error("DATABASE_URL is not set");
  const dst = client(newUrl);
  await dst.connect();
  const done = await dst.query(`SELECT 1 FROM "AppSetting" WHERE key = $1`, [MARKER]).catch(() => ({ rowCount: 0 }));
  if (done.rowCount) {
    console.log("[copy] already copied from the old database — skipping (you can remove OLD_DATABASE_URL).");
    await dst.end();
    return;
  }
  const src = client(oldUrl);
  await src.connect();
  console.log("[copy] copying the old database into this one…");

  const tablesQ = `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`;
  const newTables = new Set((await dst.query(tablesQ)).rows.map((r) => r.t as string));
  const oldTables = new Set((await src.query(tablesQ)).rows.map((r) => r.t as string));
  const tables = [...newTables].filter((t) => oldTables.has(t));

  // Copy parents before children (foreign keys).
  const fks = (
    await dst.query(`
      SELECT c.relname AS child, p.relname AS parent FROM pg_constraint k
      JOIN pg_class c ON c.oid = k.conrelid JOIN pg_class p ON p.oid = k.confrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE k.contype = 'f' AND n.nspname = 'public'`)
  ).rows as Array<{ child: string; parent: string }>;
  const order: string[] = [];
  const left = new Set(tables);
  while (left.size) {
    const ready = [...left].filter((t) => !fks.some((f) => f.child === t && f.parent !== t && left.has(f.parent)));
    const next = ready.length ? ready : [[...left][0]]; // a cycle: just go on
    for (const t of next) {
      order.push(t);
      left.delete(t);
    }
  }

  const cols = async (c: Client, t: string) =>
    (await c.query(`SELECT column_name AS name, data_type AS type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [t])).rows as Array<{ name: string; type: string }>;

  await dst.query("BEGIN");
  // Clear what this new site set up for itself on first start (starter data), then copy.
  await dst.query(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} CASCADE`);
  let total = 0;
  for (const t of order) {
    const oldCols = new Set((await cols(src, t)).map((c) => c.name));
    const shared = (await cols(dst, t)).filter((c) => oldCols.has(c.name));
    if (!shared.length) continue;
    const list = shared.map((c) => `"${c.name}"`).join(", ");
    const json = shared.map((c) => c.type === "json" || c.type === "jsonb");
    const perBatch = Math.max(1, Math.min(1000, Math.floor(60000 / shared.length)));
    let offset = 0;
    const started = Date.now();
    // One pass through the table with a cursor (fast on big tables).
    await src.query("BEGIN READ ONLY");
    await src.query(`DECLARE rows_cur NO SCROLL CURSOR FOR SELECT ${list} FROM "${t}"`);
    for (;;) {
      const { rows } = await src.query(`FETCH ${perBatch} FROM rows_cur`);
      if (!rows.length) break;
      const values: unknown[] = [];
      const tuples = rows.map((r) => `(${shared.map((c, i) => {
        const v = r[c.name];
        values.push(json[i] && v !== null ? JSON.stringify(v) : v);
        return `$${values.length}`;
      }).join(", ")})`);
      await dst.query(`INSERT INTO "${t}" (${list}) VALUES ${tuples.join(", ")}`, values);
      offset += rows.length;
      total += rows.length;
    }
    await src.query("CLOSE rows_cur");
    await src.query("COMMIT");
    if (offset) console.log(`[copy] ${t}: ${offset} (${Math.round((Date.now() - started) / 1000)}s)`);
  }
  // Any number sequences carry on from the copied rows.
  const seqs = (
    await dst.query(`SELECT s.relname AS seq, t.relname AS tbl, a.attname AS col FROM pg_class s
      JOIN pg_depend d ON d.objid = s.oid JOIN pg_class t ON t.oid = d.refobjid JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
      WHERE s.relkind = 'S'`)
  ).rows as Array<{ seq: string; tbl: string; col: string }>;
  for (const s of seqs) await dst.query(`SELECT setval('"${s.seq}"', COALESCE((SELECT MAX("${s.col}") FROM "${s.tbl}"), 0) + 1, false)`);
  await dst.query(`INSERT INTO "AppSetting" (key, value, "updatedAt") VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [MARKER, JSON.stringify(new Date().toISOString())]);
  await dst.query("COMMIT");
  console.log(`[copy] done: ${total} rows copied.`);
  await src.end();
  await dst.end();
}

main().catch((e) => {
  // Never stop the site starting: the copy is all-or-nothing, so a failure leaves this site as it was.
  console.error("[copy] FAILED — nothing was copied. Check OLD_DATABASE_URL and deploy again:", e instanceof Error ? e.message : e);
});
