import { EmptyState } from '../../components/states/EmptyState';
import styles from './AdminPage.module.css';

export function AdminOverviewPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Administration</h1>
      <p className={styles.subtitle}>Reprise de Contrôle — Accès réservé</p>
      <EmptyState
        title="Interface d'administration"
        description="Les workflows administrateur seront implémentés dans les builds futurs."
      />
    </div>
  );
}
