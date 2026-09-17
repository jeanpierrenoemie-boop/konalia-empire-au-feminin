import { LockedState } from '../../components/states/LockedState';
import { CadreProgression } from '../../components/cadre/CadreProgression';
import styles from './Page.module.css';

export function ParcoursPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Mon Parcours</h1>
      </div>
      <div className={styles.cadreSection}>
        <p className={styles.sectionLabel}>Étapes C.A.D.R.E.</p>
        <CadreProgression currentStep={null} />
      </div>
      <LockedState
        title="Parcours à venir"
        reason="Les sprints S1–S12 et les missions de ton parcours apparaîtront ici."
        prerequisite="Configuration du parcours (Build 2)"
      />
    </div>
  );
}
