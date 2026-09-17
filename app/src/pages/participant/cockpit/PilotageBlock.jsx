import styles from './PilotageBlock.module.css';

export function PilotageBlock({ pilotage }) {
  if (!pilotage) return null;

  const {
    current_priority,
    priority_reason,
    next_action,
    duration_estimate,
    blocker,
    dependency,
  } = pilotage;

  const hasBlocker = blocker?.trim();
  const hasDependency = dependency?.trim();

  return (
    <div className={styles.wrapper}>
      {/* Q2 — Priorité actuelle */}
      <section className={styles.section}>
        <span className={styles.q}>Ma priorité actuelle</span>
        <p className={styles.priority}>{current_priority || '—'}</p>
        {priority_reason && (
          <p className={styles.reason}>{priority_reason}</p>
        )}
      </section>

      {/* Q4 — Prochaine action */}
      {next_action && (
        <section className={styles.section}>
          <span className={styles.q}>Prochaine action concrète</span>
          <p className={styles.action}>{next_action}</p>
          {duration_estimate && (
            <span className={styles.duration}>⏱ {duration_estimate}</span>
          )}
        </section>
      )}

      {/* Q5 — Blocage / Dépendance */}
      {(hasBlocker || hasDependency) && (
        <section className={`${styles.section} ${styles.blockerSection}`}>
          {hasBlocker && (
            <div className={styles.blocker}>
              <span className={styles.blockerLabel}>Blocage</span>
              <p>{blocker}</p>
            </div>
          )}
          {hasDependency && (
            <div className={styles.dependency}>
              <span className={styles.depLabel}>Dépendance</span>
              <p>{dependency}</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
