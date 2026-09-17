/**
 * BUILD 20 — PostgreSQL Pilot Readiness Integration Tests
 *
 * Requires a running PostgreSQL instance.
 * Run with:
 *   TEST_DATABASE_URL=postgresql://rc_test:rc_test_pw@127.0.0.1:5432/rc_test_b20 \
 *   PGSSLMODE=disable \
 *   npx vitest run src/routes/b20-pg.test.js
 *
 * Skipped automatically when TEST_DATABASE_URL is not set.
 */

const PG_URL = process.env.TEST_DATABASE_URL;

// Must be set before any imports that read these env vars
if (PG_URL) {
  process.env.DB_DRIVER = 'postgres';
  process.env.DATABASE_URL = PG_URL;
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'b20-pg-test-secret-32-chars-long!';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.COOKIE_SECURE = 'false';
  process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
  process.env.APP_BASE_URL = 'http://localhost:5173';
}

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';

const describeIf = PG_URL ? describe : describe.skip;

describeIf('BUILD 20 — PostgreSQL adapter smoke tests', () => {
  let db;

  beforeAll(async () => {
    const { runPgMigrations } = await import('../db/migrate-pg.js');
    const { initAdapter, getAdapter, resetAdapter: _reset } = await import('../db/adapter.js');

    await runPgMigrations(PG_URL);
    await initAdapter();
    db = getAdapter();
  });

  afterAll(async () => {
    const { resetAdapter } = await import('../db/adapter.js');
    resetAdapter();
  });

  it('queryOne returns null for missing row', async () => {
    const row = await db.queryOne(
      `SELECT id FROM users WHERE id = ?`,
      ['00000000-0000-0000-0000-000000000000']
    );
    expect(row).toBeNull();
  });

  it('queryAll returns an array', async () => {
    const rows = await db.queryAll(`SELECT 1 AS n`, []);
    expect(Array.isArray(rows)).toBe(true);
    expect(Number(rows[0].n)).toBe(1);
  });

  it('execute INSERT + queryOne round-trip', async () => {
    const id = randomUUID();
    const email = `b20test+${id.slice(0, 8)}@example.com`;

    await db.execute(
      `INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, email, 'fakehash', 'PARTICIPANTE_STARTER', 'STARTER', 'B20Test', false]
    );

    const user = await db.queryOne(`SELECT id, email FROM users WHERE id = ?`, [id]);
    expect(user).not.toBeNull();
    expect(user.email).toBe(email);

    await db.execute(`DELETE FROM users WHERE id = ?`, [id]);
  });

  it('transaction commits on success', async () => {
    const id = randomUUID();
    const email = `b20tx+${id.slice(0, 8)}@example.com`;

    await db.transaction(async tx => {
      await tx.execute(
        `INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, email, 'fakehash', 'PARTICIPANTE_STARTER', 'STARTER', 'TxTest', false]
      );
    });

    const user = await db.queryOne(`SELECT id FROM users WHERE id = ?`, [id]);
    expect(user).not.toBeNull();

    await db.execute(`DELETE FROM users WHERE id = ?`, [id]);
  });

  it('transaction rolls back on error', async () => {
    const id = randomUUID();
    const email = `b20rb+${id.slice(0, 8)}@example.com`;

    await expect(
      db.transaction(async tx => {
        await tx.execute(
          `INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, email, 'fakehash', 'PARTICIPANTE_STARTER', 'STARTER', 'RbTest', false]
        );
        throw new Error('intentional rollback');
      })
    ).rejects.toThrow('intentional rollback');

    const user = await db.queryOne(`SELECT id FROM users WHERE id = ?`, [id]);
    expect(user).toBeNull();
  });

  it('writeAudit inserts an audit_events row', async () => {
    const actorId = randomUUID();

    await db.execute(
      `INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [actorId, `b20audit+${actorId.slice(0, 8)}@example.com`, 'fakehash', 'PARTICIPANTE_STARTER', 'STARTER', 'AuditTest', false]
    );

    await db.writeAudit({
      actorId,
      targetUserId: actorId,
      eventType: 'b20_test',
      tableName: 'users',
      recordId: actorId,
      afterState: { test: true },
    });

    const row = await db.queryOne(
      `SELECT id FROM audit_events WHERE actor_id = ? AND event_type = ?`,
      [actorId, 'b20_test']
    );
    expect(row).not.toBeNull();

    await db.execute(`DELETE FROM audit_events WHERE actor_id = ?`, [actorId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [actorId]);
  });

  it('datetime(now) in SQL is converted to NOW() for PG', async () => {
    // Verify the toPostgres() conversion works: insert with datetime('now') in SQL
    const id = randomUUID();
    await db.execute(
      `INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [id, `b20ts+${id.slice(0, 8)}@example.com`, 'fakehash', 'PARTICIPANTE_STARTER', 'STARTER', 'TsTest', false]
    );
    const user = await db.queryOne(`SELECT created_at FROM users WHERE id = ?`, [id]);
    expect(user).not.toBeNull();
    expect(user.created_at).toBeTruthy();
    await db.execute(`DELETE FROM users WHERE id = ?`, [id]);
  });
});
