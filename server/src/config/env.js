/**
 * Centralized environment configuration.
 *
 * APP_ENV controls which feature-gates are active:
 *   development  — local dev; test accounts allowed; seed allowed
 *   test         — CI / automated tests; test accounts allowed; seed allowed
 *   pilot        — live pilot with real participants; test accounts FORBIDDEN; seed FORBIDDEN
 *   production   — full production; test accounts FORBIDDEN; seed FORBIDDEN
 *
 * NODE_ENV is left for frameworks/tools (vitest, express, etc.) and must NOT be
 * used for business-level guards like test-account blocking.
 *
 * Default: 'development' so that existing dev/test workflows need no config change.
 */

const VALID = ['development', 'test', 'pilot', 'production'];

export function getAppEnv() {
  const val = process.env.APP_ENV ?? 'development';
  if (!VALID.includes(val)) {
    throw new Error(`APP_ENV must be one of: ${VALID.join(', ')}. Got: "${val}"`);
  }
  return val;
}

/** True in environments where test/QA accounts must be forbidden. */
export function isTestForbidden() {
  const env = getAppEnv();
  return env === 'pilot' || env === 'production';
}

/** True in environments where the dev seed must be refused. */
export function isSeedForbidden() {
  return isTestForbidden();
}
