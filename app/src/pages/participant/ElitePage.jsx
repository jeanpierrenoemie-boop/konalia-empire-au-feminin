import { EmptyState } from '../../components/states/EmptyState';
import styles from './Page.module.css';

export function ElitePage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Mes Points ELITE</h1>
      </div>
      <EmptyState
        title="Espace ELITE"
        description="Ton tableau de bord ELITE et tes points apparaîtront ici."
      />
    </div>
  );
}
