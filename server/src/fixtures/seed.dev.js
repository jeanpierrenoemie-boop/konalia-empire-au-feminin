/**
 * Dev/test fixtures ONLY — never run in production.
 * Creates: Sarah Test (STARTER), Amélie Test (ELITE), Noémie Admin, QA user.
 * All test participants flagged is_test=1.
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { hashPassword } from '../auth.js';
import { getDb } from '../db.js';

if (process.env.NODE_ENV === 'production') {
  console.error('REFUSING to seed test fixtures in production.');
  process.exit(1);
}

const db = getDb();

const fixtures = [
  {
    id: randomUUID(),
    email: 'sarah.test@rc-dev.local',
    password: 'TestSarah2025!',
    role: 'PARTICIPANTE_STARTER',
    tier: 'STARTER',
    first_name: 'Sarah',
    cohort_id: 'cohort-pilot-01',
    is_test: 1,
  },
  {
    id: randomUUID(),
    email: 'amelie.test@rc-dev.local',
    password: 'TestAmelie2025!',
    role: 'PARTICIPANTE_ELITE',
    tier: 'ELITE',
    first_name: 'Amélie',
    cohort_id: 'cohort-pilot-01',
    is_test: 1,
  },
  {
    id: randomUUID(),
    email: 'noemie.admin@rc-dev.local',
    password: 'AdminNoemie2025!',
    role: 'NOEMIE_ADMIN',
    tier: 'ADMIN',
    first_name: 'Noémie',
    cohort_id: null,
    is_test: 0,
  },
  {
    id: randomUUID(),
    email: 'qa@rc-dev.local',
    password: 'TestQA2025!',
    role: 'TEST_QA',
    tier: 'TEST',
    first_name: 'QA',
    cohort_id: 'cohort-pilot-test',
    is_test: 1,
  },
];

const insert = db.prepare(`
  INSERT OR IGNORE INTO users (id, email, password_hash, role, tier, first_name, cohort_id, is_test)
  VALUES (@id, @email, @password_hash, @role, @tier, @first_name, @cohort_id, @is_test)
`);

for (const f of fixtures) {
  const hash = await hashPassword(f.password);
  insert.run({ ...f, password_hash: hash });
  console.log(`✓ ${f.first_name} (${f.role}) — ${f.email}`);
}

console.log('\nFixtures dev insérées. Ces comptes ne doivent JAMAIS exister en production.');
