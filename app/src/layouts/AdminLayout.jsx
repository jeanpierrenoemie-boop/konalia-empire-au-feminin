import { Outlet } from 'react-router-dom';
import styles from './AdminLayout.module.css';

export function AdminLayout() {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>RC</span>
          <div>
            <div className={styles.logoTitle}>Reprise de Contrôle</div>
            <div className={styles.adminBadge}>Administration</div>
          </div>
        </div>
        <nav className={styles.nav} aria-label="Navigation admin">
          <a href="/admin" className={styles.item}>Vue d'ensemble</a>
          <a href="/admin/participants" className={styles.item}>Participantes</a>
          <a href="/admin/parcours" className={styles.item}>Parcours</a>
          <a href="/admin/preuves" className={styles.item}>Preuves</a>
          <a href="/admin/labs" className={styles.item}>Labs</a>
          <a href="/admin/ressources" className={styles.item}>Ressources</a>
          <a href="/admin/frictions" className={styles.item}>Frictions</a>
        </nav>
      </aside>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
