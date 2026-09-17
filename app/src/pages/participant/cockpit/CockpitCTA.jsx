import { Link } from 'react-router-dom';
import styles from './CockpitCTA.module.css';

export function CockpitCTA({ openSupportCount }) {
  return (
    <div className={styles.wrapper}>
      <Link to="/parcours" className={styles.primary}>
        Continuer ma mission →
      </Link>
      <Link
        to="/support"
        className={`${styles.secondary} ${openSupportCount > 0 ? styles.hasOpen : ''}`}
      >
        J'ai besoin d'aide
        {openSupportCount > 0 && (
          <span className={styles.badge}>{openSupportCount}</span>
        )}
      </Link>
    </div>
  );
}
