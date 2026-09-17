import { Link } from 'react-router-dom';
import styles from './PasMaintenantBlock.module.css';

export function PasMaintenantBlock({ pilotage, parkingCount, agirMaintenantCount }) {
  const notNow = pilotage?.not_priority_now?.trim();
  const hasContent = notNow || parkingCount > 0 || agirMaintenantCount > 0;

  if (!hasContent) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.headerRow}>
        <span className={styles.label}>PAS MAINTENANT</span>
        <Link to="/parking" className={styles.parkingLink}>Parking à Idées →</Link>
      </div>
      <p className={styles.sublabel}>
        Ces éléments sont notés — ils n'ont pas disparu. Tu y reviendras quand c'est le bon moment.
      </p>

      {agirMaintenantCount > 0 && (
        <Link to="/parking" className={styles.agirRow}>
          <span className={styles.itemIcon}>▶</span>
          <p>
            {agirMaintenantCount} idée{agirMaintenantCount > 1 ? 's' : ''} à <strong>agir maintenant</strong> en attente
          </p>
        </Link>
      )}

      {notNow && (
        <div className={styles.item}>
          <span className={styles.itemIcon}>⊘</span>
          <p>{notNow}</p>
        </div>
      )}

      {parkingCount > 0 && (
        <Link to="/parking" className={styles.parking}>
          <span className={styles.itemIcon}>◫</span>
          <p>{parkingCount} idée{parkingCount > 1 ? 's' : ''} en parking</p>
        </Link>
      )}
    </div>
  );
}
