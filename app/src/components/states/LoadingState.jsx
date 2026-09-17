import styles from './States.module.css';

export function LoadingState({ label = 'Chargement…' }) {
  return (
    <div className={styles.container} role="status" aria-live="polite" aria-label={label}>
      <div className={styles.spinner} aria-hidden="true" />
      <p className={styles.description}>{label}</p>
    </div>
  );
}
