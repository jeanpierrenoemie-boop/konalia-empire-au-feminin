import { Link } from 'react-router-dom';
import styles from './LastDecision.module.css';

const TYPE_LABELS = {
  project:  'Projet',
  pivot:    'Pivot',
  persona:  'Persona',
  revenue:  'Modèle de revenu',
  go_nogo:  'Go / No-go',
  scope:    'Périmètre',
  other:    'Autre',
};

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

export function LastDecision({ decision }) {
  if (!decision) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.labelRow}>
        <span className={styles.label}>Dernière décision validée</span>
        <Link to="/decisions" className={styles.journalLink}>Journal des Décisions →</Link>
      </div>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.type}>{TYPE_LABELS[decision.decision_type] ?? decision.decision_type}</span>
          <span className={styles.date}>{formatDate(decision.created_at)}</span>
        </div>
        <p className={styles.title}>{decision.title}</p>
        {decision.rationale && (
          <p className={styles.rationale}>{decision.rationale}</p>
        )}
      </div>
    </div>
  );
}
