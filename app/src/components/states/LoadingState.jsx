import styles from './States.module.css';

export function LoadingState({ label = 'Chargement…' }) {
  return (
    <div className={styles.container}>
      <div className={styles.spinner} aria-hidden="true" />
      <p className={styles.description}>{label}</p>
    </div>
  );
}
