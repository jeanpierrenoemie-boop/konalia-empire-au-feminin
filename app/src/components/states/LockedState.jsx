import styles from './States.module.css';

export function LockedState({ title = 'Accès verrouillé', reason, prerequisite }) {
  return (
    <div className={styles.container}>
      <div className={styles.lockedIcon}>⊠</div>
      <p className={styles.title}>{title}</p>
      {reason && <p className={styles.description}>{reason}</p>}
      {prerequisite && (
        <div className={styles.prereq}>
          <span className={styles.prereqLabel}>Prérequis :</span>
          <span>{prerequisite}</span>
        </div>
      )}
    </div>
  );
}
