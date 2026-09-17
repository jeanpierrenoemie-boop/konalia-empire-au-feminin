import { Link } from 'react-router-dom';
import styles from './ProofsBar.module.css';

const PROOF_LABELS = {
  screenshot:   'Captures',
  note:         'Notes',
  link:         'Liens',
  conversation: 'Conversations',
  signal:       'Signaux',
};

export function ProofsBar({ proofs, total }) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.label}>Mes Preuves</span>
        <Link to="/preuves" className={styles.link}>Voir tout →</Link>
      </div>

      <div className={styles.types}>
        {proofs.map(p => (
          <div key={p.type} className={`${styles.type} ${p.count > 0 ? styles.active : ''}`}>
            <span className={styles.count}>{p.count}</span>
            <span className={styles.typeName}>{PROOF_LABELS[p.type]}</span>
          </div>
        ))}
      </div>

      {total === 0 && (
        <p className={styles.empty}>
          Tes premières preuves apparaîtront ici dès que tu documenteras une action.
        </p>
      )}
    </div>
  );
}
