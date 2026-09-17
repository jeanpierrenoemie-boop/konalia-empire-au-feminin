import styles from './StatusBadge.module.css';

const VARIANTS = {
  vert: { label: 'En bonne voie', className: styles.vert },
  orange: { label: 'Attention requise', className: styles.orange },
  rouge: { label: 'Bloqué', className: styles.rouge },
};

export function StatusBadge({ variant = 'vert', label, size = 'md' }) {
  const config = VARIANTS[variant];
  return (
    <span className={`${styles.badge} ${config.className} ${styles[size]}`}>
      <span className={styles.dot} />
      {label ?? config.label}
    </span>
  );
}
