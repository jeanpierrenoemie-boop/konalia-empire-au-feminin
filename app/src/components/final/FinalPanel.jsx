import { useState, useEffect } from 'react';
import styles from './FinalPanel.module.css';

export function FinalPanel({ sprint }) {
  const [plan, setPlan] = useState(null);

  useEffect(() => {
    fetch('/api/s12/continuity-plan', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPlan(d); })
      .catch(() => {});
  }, []);

  const goal = plan?.ninety_day_goal;
  const priority = plan?.priority;
  const phase30 = plan?.phases?.days_1_30;
  const decision = plan?.continuity_decision_id;

  return (
    <div className={styles.panel}>
      <div className={styles.hero}>
        <div className={styles.heroIcon} aria-hidden>🎓</div>
        <h2 className={styles.heroTitle}>Félicitations — tu as terminé l'Empire au Féminin</h2>
        <p className={styles.heroSub}>
          12 sprints. Une décision réelle. Un plan de continuation.
          Tu repars avec une boussole, pas une promesse.
        </p>
      </div>

      {goal && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Ton cap 90 jours</h3>
          <p className={styles.goalText}>{goal}</p>
          {priority && (
            <div className={styles.priorityRow}>
              <span className={styles.priorityLabel}>Priorité unique :</span>
              <span className={styles.priorityValue}>{priority}</span>
            </div>
          )}
        </section>
      )}

      {phase30?.objective && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Tes 30 premiers jours</h3>
          <p className={styles.phaseObjective}>{phase30.objective}</p>
          {phase30.actions && (
            <p className={styles.phaseActions}>{phase30.actions}</p>
          )}
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Prochaines étapes</h3>
        <ol className={styles.nextStepsList}>
          <li>Reviens consulter ton plan 90J dans l'onglet Sprint 12</li>
          <li>Lance ta prochaine action terrain dans les 48h</li>
          <li>Rejoins la communauté alumni pour maintenir l'élan</li>
        </ol>
      </section>

      <div className={styles.badge}>
        <span className={styles.badgeText}>Diplômée Empire au Féminin</span>
        {decision && (
          <span className={styles.badgeSub}>Décision de continuité enregistrée</span>
        )}
      </div>
    </div>
  );
}
