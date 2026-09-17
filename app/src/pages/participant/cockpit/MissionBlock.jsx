import { Link } from 'react-router-dom';
import styles from './MissionBlock.module.css';

const STATUS_LABEL = {
  draft:     'En cours',
  submitted: 'Soumise, en attente',
  null:      'À démarrer',
};

export function MissionBlock({ mission }) {
  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Mission en cours</span>

      {mission ? (
        <>
          <p className={styles.title}>{mission.title}</p>
          {mission.description && (
            <p className={styles.desc}>{mission.description}</p>
          )}
          <div className={styles.footer}>
            <span className={`${styles.status} ${styles[mission.submission_status ?? 'none']}`}>
              {STATUS_LABEL[mission.submission_status] ?? 'À démarrer'}
            </span>
            <Link to="/parcours" className={styles.cta}>
              Continuer ma mission →
            </Link>
          </div>
        </>
      ) : (
        <p className={styles.empty}>Aucune mission active pour l'étape en cours.</p>
      )}
    </div>
  );
}
