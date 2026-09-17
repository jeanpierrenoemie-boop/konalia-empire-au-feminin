import { ROLES } from '../db.js';
import { getAdapter } from '../db/adapter.js';

/**
 * Verifies that participant_data.owner_id === req.user.id.
 * NOEMIE_ADMIN bypasses ownership (can read all pilot records).
 * Reads record_id from req.params.recordId.
 */
export async function requireOwnership(req, res, next) {
  const { user } = req;
  if (!user) return res.status(401).json({ error: 'Non authentifiée' });

  if (user.role === ROLES.NOEMIE_ADMIN) return next();

  const db = getAdapter();
  const record = await db.queryOne(
    'SELECT owner_id FROM participant_data WHERE id = ?',
    [req.params.recordId]
  );

  if (!record) return res.status(404).json({ error: 'Données introuvables' });

  if (record.owner_id !== user.id) {
    return res.status(403).json({ error: 'Ces données ne vous appartiennent pas' });
  }

  next();
}

/**
 * Verifies participant belongs to the cohort owning the requested content.
 * NOEMIE_ADMIN can read any cohort.
 */
export async function requireCohortAccess(req, res, next) {
  const { user } = req;
  if (!user) return res.status(401).json({ error: 'Non authentifiée' });

  if (user.role === ROLES.NOEMIE_ADMIN) return next();

  const db = getAdapter();
  const content = await db.queryOne(
    'SELECT cohort_id FROM cohort_content WHERE id = ?',
    [req.params.contentId]
  );

  if (!content) return res.status(404).json({ error: 'Contenu introuvable' });

  if (content.cohort_id !== user.cohort_id) {
    return res.status(403).json({ error: 'Contenu non accessible pour votre cohorte' });
  }

  next();
}
