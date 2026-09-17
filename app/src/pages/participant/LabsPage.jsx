import { LockedState } from '../../components/states/LockedState';
import styles from './Page.module.css';

export function LabsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Mes Labs</h1>
      </div>
      <LockedState
        title="Labs en construction"
        reason="Les espaces d'expérimentation et de test de ton projet seront disponibles ici."
        prerequisite="Logique Labs (Build futur)"
      />
    </div>
  );
}
