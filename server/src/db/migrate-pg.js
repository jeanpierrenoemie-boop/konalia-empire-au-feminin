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

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL environment variable is required.');
    process.exit(1);
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
    console.log('Running PostgreSQL schema migration…');
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Migration complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
