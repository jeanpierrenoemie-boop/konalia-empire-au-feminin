import { LockedState } from '../../components/states/LockedState';
import styles from './Page.module.css';

export function QGPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Le QG</h1>
      </div>
      <LockedState
        title="Le QG arrive bientôt"
        reason="L'espace communautaire des participantes sera disponible dans un prochain build."
        prerequisite="Logique QG (Build futur)"
      />
    </div>
  );
}
