import { EmptyState } from '../../components/states/EmptyState';
import styles from './Page.module.css';

export function PreuvesPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Mes Preuves</h1>
      </div>
      <EmptyState
        title="Aucune preuve enregistrée"
        description="Tes preuves de progression et de passage à l'action seront visibles ici."
      />
    </div>
  );
}
