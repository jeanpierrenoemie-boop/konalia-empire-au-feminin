import { Link } from 'react-router-dom';
import styles from './CockpitCTA.module.css';

export function CockpitCTA({ openSupportCount, onSignaler }) {
  return (
    <div className={styles.wrapper}>
      <Link to="/parcours" className={styles.primary}>
        Continuer ma mission →
      </Link>
      <button
        type="button"
        className={`${styles.secondary} ${openSupportCount > 0 ? styles.hasOpen : ''}`}
        onClick={onSignaler}
      >
        J'ai besoin d'aide
        {openSupportCount > 0 && (
          <span className={styles.badge} aria-label={`${openSupportCount} signalement${openSupportCount > 1 ? 's' : ''} ouvert${openSupportCount > 1 ? 's' : ''}`}>
            {openSupportCount}
          </span>
        )}
      </button>
    </div>
  );
}
