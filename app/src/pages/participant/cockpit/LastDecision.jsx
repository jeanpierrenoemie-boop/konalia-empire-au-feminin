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
      <span className={styles.label}>Dernière décision validée</span>
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
