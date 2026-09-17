import styles from './States.module.css';

export function ErrorState({ title = 'Une erreur est survenue', message, onRetry }) {
  return (
    <div className={styles.container} role="alert" aria-live="assertive">
      <div className={styles.errorIcon} aria-hidden="true">⚠</div>
      <p className={styles.title}>{title}</p>
      {message && <p className={styles.description}>{message}</p>}
      {onRetry && (
        <button className={styles.retryBtn} onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}
