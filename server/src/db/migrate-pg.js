/**
 * PostgreSQL migration runner — Build 20.
 * Reads schema.pg.sql and applies it idempotently (all statements use IF NOT EXISTS).
 *
 * Usage:
 *   node server/src/db/migrate-pg.js
 *
 * Requires DATABASE_URL env variable.
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runPgMigrations(connectionString) {
  if (!connectionString) {
    throw new Error('runPgMigrations: connectionString is required');
  }

  const { Pool } = pg;
  const pool = new Pool({
    connectionString,
    ssl: process.env.PGSSLMODE !== 'disable' ? { rejectUnauthorized: false } : false,
  });

  const schemaPath = path.join(__dirname, '..', 'migrations', 'pg', 'schema.pg.sql');
  const sql = readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query(sql);
  } finally {
    client.release();
    await pool.end();
  }
}

/* CLI entrypoint */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('ERROR: DATABASE_URL required'); process.exit(1); }
  console.log('Running PostgreSQL schema migration…');
  runPgMigrations(url)
    .then(() => { console.log('Migration complete.'); process.exit(0); })
    .catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
}
