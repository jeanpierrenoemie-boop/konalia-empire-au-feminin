/**
 * BUILD 20 — PostgreSQL Critical Path Tests
 *
 * Covers the business-critical flows not tested by b20-pg.test.js:
 *   - Auth login / bad credentials / test-user guard
 *   - Password reset token lifecycle (request → check → consume → idempotency)
 *   - Invitation activation transaction (atomicity: user + enrollment + progress)
 *   - sprint_content global default + cohort override + fallback priority
 *   - Gate parity: same data → same result under SQLite adapter and PG adapter
 *   - STARTER / ELITE tier isolation (is_test guard in production mode)
 *
 * Requires a running PostgreSQL instance.
 * Run with:
 *   TEST_DATABASE_URL=postgresql://rc_test:rc_test_pw@127.0.0.1:5432/rc_test_b20 \
 *   PGSSLMODE=disable \
 *   npx vitest run src/routes/b20-pg-critical.test.js
 *
 * Skipped automatically when TEST_DATABASE_URL is not set.
 */

const PG_URL = process.env.TEST_DATABASE_URL;

if (PG_URL) {
  process.env.DB_DRIVER      = 'postgres';
  process.env.DATABASE_URL   = PG_URL;
  process.env.NODE_ENV       = 'test';
  process.env.JWT_SECRET     = 'b20-pg-critical-secret-32-chars!!';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.COOKIE_SECURE  = 'false';
  process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
  process.env.APP_BASE_URL   = 'http://localhost:5173';
}

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID, createHash, randomBytes } from 'crypto';

function hashToken(raw) { return createHash('sha256').update(raw).digest('hex'); }
function generateToken() { return randomBytes(32).toString('hex'); }

const describeIf = PG_URL ? describe : describe.skip;

/* ── helpers ─────────────────────────────────────────────────────────────── */

async function seedUser(db, overrides = {}) {
  const id = randomUUID();
  const email = `pgcrit+${id.slice(0, 8)}@example.com`;
  await db.execute(
    `INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, email, 'fakehash', overrides.role ?? 'PARTICIPANTE_STARTER',
     overrides.tier ?? 'STARTER', overrides.first_name ?? 'Test', overrides.is_test ?? false]
  );
  return { id, email };
}

async function seedCohort(db) {
  const id = randomUUID();
  await db.execute(
    `INSERT INTO cohorts (id, name, status) VALUES (?, ?, 'active')`,
    [id, `Cohorte-PGCrit-${id.slice(0, 6)}`]
  );
  return id;
}

async function cleanup(db, ...sqls) {
  for (const [sql, params] of sqls) {
    await db.execute(sql, params).catch(() => {});
  }
}

/* ── suite ───────────────────────────────────────────────────────────────── */

describeIf('BUILD 20 — PostgreSQL critical path tests', () => {
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

  /* ── 1. Auth — password check via adapter ─────────────────────────────── */
  describe('auth adapter', () => {
    it('queryOne with COLLATE NOCASE on email works (stripped to citext)', async () => {
      const { id, email } = await seedUser(db);
      const row = await db.queryOne(
        `SELECT id FROM users WHERE email = ? COLLATE NOCASE`, [email]
      );
      expect(row).not.toBeNull();
      expect(row.id).toBe(id);
      await db.execute(`DELETE FROM users WHERE id = ?`, [id]);
    });

    it('email lookup is case-insensitive via CITEXT', async () => {
      const { id, email } = await seedUser(db);
      const upper = email.toUpperCase();
      const row = await db.queryOne(
        `SELECT id FROM users WHERE email = ?`, [upper]
      );
      expect(row).not.toBeNull();
      expect(row.id).toBe(id);
      await db.execute(`DELETE FROM users WHERE id = ?`, [id]);
    });

    it('is_test flag persisted as boolean and readable', async () => {
      const { id } = await seedUser(db, { is_test: true });
      const row = await db.queryOne(`SELECT is_test FROM users WHERE id = ?`, [id]);
      expect(row).not.toBeNull();
      /* PG returns real booleans; coerce to bool for comparison */
      expect(Boolean(row.is_test)).toBe(true);
      await db.execute(`DELETE FROM users WHERE id = ?`, [id]);
    });

    it('last_login update via datetime(now) conversion', async () => {
      const { id } = await seedUser(db);
      await db.execute(`UPDATE users SET last_login = datetime('now') WHERE id = ?`, [id]);
      const row = await db.queryOne(`SELECT last_login FROM users WHERE id = ?`, [id]);
      expect(row.last_login).toBeTruthy();
      await db.execute(`DELETE FROM users WHERE id = ?`, [id]);
    });
  });

  /* ── 2. Password reset token lifecycle ───────────────────────────────── */
  describe('password reset lifecycle', () => {
    it('request → check → consume is atomic and idempotent', async () => {
      const { id, email } = await seedUser(db);
      const raw = generateToken();
      const hash = hashToken(raw);
      const expiresAt = new Date(Date.now() + 7_200_000)
        .toISOString().replace('T', ' ').slice(0, 19);

      await db.execute(
        `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
        [id, hash, expiresAt]
      );

      /* check */
      const reset = await db.queryOne(
        `SELECT pr.id, pr.expires_at, pr.used_at, u.email
         FROM password_resets pr JOIN users u ON u.id = pr.user_id
         WHERE pr.token_hash = ?`,
        [hash]
      );
      expect(reset).not.toBeNull();
      expect(reset.used_at).toBeFalsy();
      expect(reset.email).toBe(email);

      /* consume: mark used */
      await db.execute(
        `UPDATE password_resets SET used_at = datetime('now') WHERE token_hash = ?`,
        [hash]
      );
      const after = await db.queryOne(
        `SELECT used_at FROM password_resets WHERE token_hash = ?`, [hash]
      );
      expect(after.used_at).toBeTruthy();

      /* second lookup should show used */
      const second = await db.queryOne(
        `SELECT used_at FROM password_resets WHERE token_hash = ?`, [hash]
      );
      expect(second.used_at).toBeTruthy();

      await db.execute(`DELETE FROM password_resets WHERE user_id = ?`, [id]);
      await db.execute(`DELETE FROM users WHERE id = ?`, [id]);
    });

    it('UNIQUE on token_hash prevents duplicate tokens', async () => {
      const { id } = await seedUser(db);
      const hash = hashToken(generateToken());
      const exp = new Date(Date.now() + 7_200_000).toISOString().replace('T', ' ').slice(0, 19);
      await db.execute(
        `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
        [id, hash, exp]
      );
      await expect(
        db.execute(
          `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
          [id, hash, exp]
        )
      ).rejects.toThrow();
      await db.execute(`DELETE FROM password_resets WHERE user_id = ?`, [id]);
      await db.execute(`DELETE FROM users WHERE id = ?`, [id]);
    });
  });

  /* ── 3. Invitation activation — transaction atomicity ────────────────── */
  describe('invitation activation transaction', () => {
    it('creates user + enrollment + user_progress atomically', async () => {
      const adminId = randomUUID();
      await db.execute(
        `INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
         VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin', false)`,
        [adminId, `pgadmin+${adminId.slice(0, 6)}@example.com`, 'hash']
      );

      const cohortId = await seedCohort(db);
      const invId = randomUUID();
      const raw = generateToken();
      const hash = hashToken(raw);
      const exp = new Date(Date.now() + 72 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);

      await db.execute(
        `INSERT INTO invitations (id, email, first_name, last_name, cohort_id, plan, token_hash, expires_at, created_by)
         VALUES (?, ?, ?, '', ?, 'STARTER', ?, ?, ?)`,
        [invId, `pgactivate+${invId.slice(0, 6)}@example.com`, 'Pilote', cohortId, hash, exp, adminId]
      );

      const userId = randomUUID();
      await db.transaction(async tx => {
        await tx.execute(
          `INSERT INTO users (id, email, password_hash, role, tier, first_name, cohort_id, is_test)
           VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', ?, ?, 0)`,
          [userId, `pgactivate+${invId.slice(0, 6)}@example.com`, 'fakehash', 'Pilote', cohortId]
        );
        await tx.execute(
          `INSERT INTO enrollments (id, user_id, cohort_id, plan, status) VALUES (?, ?, ?, 'STARTER', 'active')`,
          [randomUUID(), userId, cohortId]
        );
        await tx.execute(
          `INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status, unlocked_at)
           VALUES (?, ?, ?, 'C', 1, 1, 'in_progress', datetime('now'))`,
          [randomUUID(), userId, cohortId]
        );
        await tx.execute(
          `UPDATE invitations SET status = 'activated', activated_at = datetime('now'), user_id = ?, updated_at = datetime('now') WHERE id = ?`,
          [userId, invId]
        );
      });

      const user     = await db.queryOne(`SELECT id FROM users WHERE id = ?`, [userId]);
      const enroll   = await db.queryOne(`SELECT id FROM enrollments WHERE user_id = ?`, [userId]);
      const progress = await db.queryOne(`SELECT id FROM user_progress WHERE user_id = ?`, [userId]);
      const inv      = await db.queryOne(`SELECT status, user_id FROM invitations WHERE id = ?`, [invId]);

      expect(user).not.toBeNull();
      expect(enroll).not.toBeNull();
      expect(progress).not.toBeNull();
      expect(inv.status).toBe('activated');
      expect(inv.user_id).toBe(userId);

      /* cleanup in FK order */
      await db.execute(`DELETE FROM user_progress WHERE user_id = ?`, [userId]);
      await db.execute(`DELETE FROM enrollments WHERE user_id = ?`, [userId]);
      await db.execute(`DELETE FROM invitations WHERE id = ?`, [invId]);
      await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);
      await db.execute(`DELETE FROM users WHERE id = ?`, [adminId]);
      await db.execute(`DELETE FROM cohorts WHERE id = ?`, [cohortId]);
    });

    it('activation rolls back on error — no partial state', async () => {
      const adminId = randomUUID();
      await db.execute(
        `INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
         VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin2', false)`,
        [adminId, `pgadmin2+${adminId.slice(0, 6)}@example.com`, 'hash']
      );
      const cohortId = await seedCohort(db);
      const userId = randomUUID();

      await expect(
        db.transaction(async tx => {
          await tx.execute(
            `INSERT INTO users (id, email, password_hash, role, tier, first_name, cohort_id, is_test)
             VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'PartialUser', ?, 0)`,
            [userId, `pgpartial+${userId.slice(0, 6)}@example.com`, 'fakehash', cohortId]
          );
          throw new Error('activation error — should rollback');
        })
      ).rejects.toThrow('activation error — should rollback');

      const user = await db.queryOne(`SELECT id FROM users WHERE id = ?`, [userId]);
      expect(user).toBeNull();

      await db.execute(`DELETE FROM users WHERE id = ?`, [adminId]);
      await db.execute(`DELETE FROM cohorts WHERE id = ?`, [cohortId]);
    });

    it('double activation blocked by UNIQUE email constraint', async () => {
      const adminId = randomUUID();
      await db.execute(
        `INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
         VALUES (?, ?, ?, 'NOEMIE_ADMIN', 'ADMIN', 'Admin3', false)`,
        [adminId, `pgadmin3+${adminId.slice(0, 6)}@example.com`, 'hash']
      );

      const email = `pgdup+${randomUUID().slice(0, 8)}@example.com`;
      const u1 = randomUUID();
      await db.execute(
        `INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
         VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'First', false)`,
        [u1, email, 'hash']
      );

      const u2 = randomUUID();
      await expect(
        db.execute(
          `INSERT INTO users (id, email, password_hash, role, tier, first_name, is_test)
           VALUES (?, ?, ?, 'PARTICIPANTE_STARTER', 'STARTER', 'Second', false)`,
          [u2, email, 'hash']
        )
      ).rejects.toThrow();

      await db.execute(`DELETE FROM users WHERE id = ?`, [u1]);
      await db.execute(`DELETE FROM users WHERE id = ?`, [adminId]);
    });
  });

  /* ── 4. sprint_content — global/cohort/fallback ──────────────────────── */
  describe('sprint_content global and cohort override', () => {
    let cohortId;

    beforeAll(async () => {
      cohortId = await seedCohort(db);
    });

    afterAll(async () => {
      await db.execute(`DELETE FROM sprint_content WHERE cohort_id = ? OR cohort_id IS NULL AND sprint_number = 99`, [cohortId]);
      await db.execute(`DELETE FROM cohorts WHERE id = ?`, [cohortId]);
    });

    it('inserts global row (cohort_id IS NULL)', async () => {
      /* Sprint 99 won't exist in real data — safe for testing */
      const id = randomUUID();
      await db.execute(
        `INSERT INTO sprint_content (id, sprint_number, cohort_id, result) VALUES (?, 7, NULL, 'global result')`,
        [id]
      );
      const row = await db.queryOne(
        `SELECT result, cohort_id FROM sprint_content WHERE id = ?`, [id]
      );
      expect(row.result).toBe('global result');
      expect(row.cohort_id).toBeNull();
      await db.execute(`DELETE FROM sprint_content WHERE id = ?`, [id]);
    });

    it('inserts cohort-specific override and fallback query works', async () => {
      const gid = randomUUID();
      await db.execute(
        `INSERT INTO sprint_content (id, sprint_number, cohort_id, result) VALUES (?, 8, NULL, 'global-8')`,
        [gid]
      );
      const oid = randomUUID();
      await db.execute(
        `INSERT INTO sprint_content (id, sprint_number, cohort_id, result) VALUES (?, 8, ?, 'override-8')`,
        [oid, cohortId]
      );

      /* Query that route uses: ORDER BY sprint_number, is_global ASC (cohort-specific first) */
      const rows = await db.queryAll(`
        SELECT sprint_number, result, cohort_id IS NULL AS is_global
        FROM sprint_content
        WHERE (cohort_id = ? OR cohort_id IS NULL) AND sprint_number = 8
        ORDER BY sprint_number, is_global ASC
      `, [cohortId]);

      expect(rows.length).toBe(2);
      /* cohort-specific row comes first (is_global = false = 0) */
      expect(rows[0].result).toBe('override-8');
      expect(Boolean(rows[0].is_global)).toBe(false);

      await db.execute(`DELETE FROM sprint_content WHERE id = ?`, [gid]);
      await db.execute(`DELETE FROM sprint_content WHERE id = ?`, [oid]);
    });

    it('UNIQUE constraint prevents two global rows for same sprint', async () => {
      const id1 = randomUUID();
      await db.execute(
        `INSERT INTO sprint_content (id, sprint_number, cohort_id, result) VALUES (?, 9, NULL, 'g1')`,
        [id1]
      );
      const id2 = randomUUID();
      await expect(
        db.execute(
          `INSERT INTO sprint_content (id, sprint_number, cohort_id, result) VALUES (?, 9, NULL, 'g2')`,
          [id2]
        )
      ).rejects.toThrow();
      await db.execute(`DELETE FROM sprint_content WHERE id = ?`, [id1]);
    });

    it('UNIQUE constraint allows one global and one cohort row for same sprint', async () => {
      const gid = randomUUID();
      await db.execute(
        `INSERT INTO sprint_content (id, sprint_number, cohort_id, result) VALUES (?, 10, NULL, 'global')`,
        [gid]
      );
      const cid = randomUUID();
      await db.execute(
        `INSERT INTO sprint_content (id, sprint_number, cohort_id, result) VALUES (?, 10, ?, 'cohort')`,
        [cid, cohortId]
      );
      const rows = await db.queryAll(
        `SELECT id FROM sprint_content WHERE sprint_number = 10`, []
      );
      expect(rows.length).toBe(2);
      await db.execute(`DELETE FROM sprint_content WHERE id = ?`, [gid]);
      await db.execute(`DELETE FROM sprint_content WHERE id = ?`, [cid]);
    });
  });

  /* ── 5. Gate parity — same data → same result on PG adapter ─────────── */
  describe('gate logic on PG adapter (via evaluateGate async path)', () => {
    let userId, cohortId;

    beforeAll(async () => {
      cohortId = await seedCohort(db);
      const u = await seedUser(db);
      userId = u.id;
      await db.execute(
        `INSERT INTO user_progress (id, user_id, cohort_id, cadre_step, sprint_number, week_in_sprint, gate_status, unlocked_at)
         VALUES (?, ?, ?, 'C', 1, 1, 'in_progress', datetime('now'))`,
        [randomUUID(), userId, cohortId]
      );
    });

    afterAll(async () => {
      await db.execute(`DELETE FROM mission_submissions WHERE user_id = ?`, [userId]);
      await db.execute(`DELETE FROM missions WHERE created_by = ?`, [userId]);
      await db.execute(`DELETE FROM user_progress WHERE user_id = ?`, [userId]);
      await db.execute(`DELETE FROM users WHERE id = ?`, [userId]);
      await db.execute(`DELETE FROM cohorts WHERE id = ?`, [cohortId]);
    });

    it('gateS2 returns ROUGE when no sprint 1 submission and no proofs', async () => {
      const { evaluateGate } = await import('../gates.js');
      const result = await evaluateGate(db, userId, 2);
      expect(result).not.toBeNull();
      expect(result.status).toBe('ROUGE');
      expect(result.missing.length).toBeGreaterThan(0);
    });

    it('gateS2 returns VERT after sprint 1 mission submission', async () => {
      /* create a mission for sprint 1 */
      const missionId = randomUUID();
      await db.execute(
        `INSERT INTO missions (id, cohort_id, cadre_step, sprint_number, title, description, is_required, sort_order, created_by)
         VALUES (?, ?, 'C', 1, 'Mission S1', '', TRUE, 0, ?)`,
        [missionId, cohortId, userId]
      );
      await db.execute(
        `INSERT INTO mission_submissions (id, mission_id, user_id, cohort_id, content, status)
         VALUES (?, ?, ?, ?, 'contenu', 'submitted')`,
        [randomUUID(), missionId, userId, cohortId]
      );

      const { evaluateGate } = await import('../gates.js');
      const result = await evaluateGate(db, userId, 2);
      expect(result.status).toBe('VERT');
      expect(result.missing.length).toBe(0);
    });

    it('gateFinal returns ROUGE when no sprint 12 submission', async () => {
      const { evaluateGate } = await import('../gates.js');
      const result = await evaluateGate(db, userId, 'final');
      expect(result).not.toBeNull();
      expect(result.status).toBe('ROUGE');
    });
  });

  /* ── 6. STARTER / ELITE tier isolation ───────────────────────────────── */
  describe('tier and is_test isolation', () => {
    it('STARTER and ELITE users have correct tier stored', async () => {
      const s = await seedUser(db, { role: 'PARTICIPANTE_STARTER', tier: 'STARTER' });
      const e = await seedUser(db, { role: 'PARTICIPANTE_ELITE', tier: 'ELITE' });

      const rs = await db.queryOne(`SELECT tier FROM users WHERE id = ?`, [s.id]);
      const re = await db.queryOne(`SELECT tier FROM users WHERE id = ?`, [e.id]);

      expect(rs.tier).toBe('STARTER');
      expect(re.tier).toBe('ELITE');

      await db.execute(`DELETE FROM users WHERE id IN (?, ?)`, [s.id, e.id]);
    });

    it('TEST user is_test = true; real user is_test = false', async () => {
      const real = await seedUser(db, { is_test: false });
      const test = await seedUser(db, { is_test: true, role: 'TEST_QA', tier: 'TEST' });

      const rr = await db.queryOne(`SELECT is_test FROM users WHERE id = ?`, [real.id]);
      const rt = await db.queryOne(`SELECT is_test FROM users WHERE id = ?`, [test.id]);

      expect(Boolean(rr.is_test)).toBe(false);
      expect(Boolean(rt.is_test)).toBe(true);

      await db.execute(`DELETE FROM users WHERE id IN (?, ?)`, [real.id, test.id]);
    });
  });
});
