/**
 * BUILD 20 — PostgreSQL Pilot Readiness Integration Tests
 *
 * Requires a running PostgreSQL instance with the schema applied.
 * Set TEST_DATABASE_URL to run these tests:
 *   TEST_DATABASE_URL=postgres://user:pass@localhost:5432/rc_test npx vitest run b20-pg.test.js
 *
 * Skipped automatically when TEST_DATABASE_URL is not set.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initAdapter, getAdapter, resetAdapter } from '../db/adapter.js';

const PG_URL = process.env.TEST_DATABASE_URL;
const describeIf = PG_URL ? describe : describe.skip;

describeIf('BUILD 20 — PostgreSQL adapter smoke tests', () => {
  let db;

  beforeAll(async () => {
    await initAdapter({ driver: 'postgres', connectionString: PG_URL });
    db = getAdapter();
  });

  afterAll(async () => {
    await resetAdapter();
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
    expect(rows[0].n).toBe(1);
  });

  it('execute INSERT + queryOne round-trip', async () => {
    const { randomUUID } = await import('crypto');
    const id = randomUUID();
    const email = `b20test+${id.slice(0, 8)}@example.com`;

    await db.execute(
      `INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      [id, email, 'hash', 'PARTICIPANT']
    );

    const user = await db.queryOne(`SELECT id, email FROM users WHERE id = ?`, [id]);
    expect(user).not.toBeNull();
    expect(user.email).toBe(email);

    // cleanup
    await db.execute(`DELETE FROM users WHERE id = ?`, [id]);
  });

  it('transaction commits on success', async () => {
    const { randomUUID } = await import('crypto');
    const id = randomUUID();
    const email = `b20tx+${id.slice(0, 8)}@example.com`;

    await db.transaction(async tx => {
      await tx.execute(
        `INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)`,
        [id, email, 'hash', 'PARTICIPANT']
      );
    });

    const user = await db.queryOne(`SELECT id FROM users WHERE id = ?`, [id]);
    expect(user).not.toBeNull();

    // cleanup
    await db.execute(`DELETE FROM users WHERE id = ?`, [id]);
  });

  it('transaction rolls back on error', async () => {
    const { randomUUID } = await import('crypto');
    const id = randomUUID();
    const email = `b20rb+${id.slice(0, 8)}@example.com`;

    await expect(
      db.transaction(async tx => {
        await tx.execute(
          `INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)`,
          [id, email, 'hash', 'PARTICIPANT']
        );
        throw new Error('intentional rollback');
      })
    ).rejects.toThrow('intentional rollback');

    const user = await db.queryOne(`SELECT id FROM users WHERE id = ?`, [id]);
    expect(user).toBeNull();
  });

  it('writeAudit inserts an audit log row', async () => {
    const { randomUUID } = await import('crypto');
    const actorId = randomUUID();

    // Insert a minimal user to satisfy FK if enforced
    await db.execute(
      `INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      [actorId, `b20audit+${actorId.slice(0, 8)}@example.com`, 'hash', 'PARTICIPANT']
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
      `SELECT id FROM audit_log WHERE actor_id = ? AND event_type = 'b20_test'`,
      [actorId]
    );
    expect(row).not.toBeNull();

    // cleanup
    await db.execute(`DELETE FROM audit_log WHERE actor_id = ?`, [actorId]);
    await db.execute(`DELETE FROM users WHERE id = ?`, [actorId]);
  });
});
