import { EmptyState } from '../../components/states/EmptyState';
import { CadreProgression } from '../../components/cadre/CadreProgression';
import { StatusBadge } from '../../components/status/StatusBadge';
import styles from './Page.module.css';

export function CockpitPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Mon Cockpit</h1>
        <StatusBadge variant="orange" label="En attente de données" />
      </div>
      <div className={styles.cadreSection}>
        <p className={styles.sectionLabel}>Progression C.A.D.R.E.</p>
        <CadreProgression currentStep={null} />
      </div>
      <EmptyState
        title="Ton cockpit se construira ici"
        description="Les décisions, indicateurs et prochaines actions de ton parcours apparaîtront dans cette vue."
      />
    </div>
  );
}
