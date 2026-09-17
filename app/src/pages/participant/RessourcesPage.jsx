import { EmptyState } from '../../components/states/EmptyState';
import styles from './Page.module.css';

export function RessourcesPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Mes Ressources</h1>
      </div>
      <EmptyState
        title="Aucune ressource disponible"
        description="Les ressources, outils et documents de ton parcours apparaîtront ici."
      />
    </div>
  );
}
