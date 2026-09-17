import styles from './PasMaintenantBlock.module.css';

export function PasMaintenantBlock({ pilotage, parkingCount }) {
  const notNow = pilotage?.not_priority_now?.trim();
  const hasContent = notNow || parkingCount > 0;

  if (!hasContent) return null;

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>PAS MAINTENANT</span>
      <p className={styles.sublabel}>
        Ces éléments sont notés — ils n'ont pas disparu. Tu y reviendras quand c'est le bon moment.
      </p>
      {notNow && (
        <div className={styles.item}>
          <span className={styles.itemIcon}>⊘</span>
          <p>{notNow}</p>
        </div>
      )}
      {parkingCount > 0 && (
        <div className={styles.parking}>
          <span className={styles.itemIcon}>◫</span>
          <p>{parkingCount} idée{parkingCount > 1 ? 's' : ''} en parking</p>
        </div>
      )}
    </div>
  );
}
