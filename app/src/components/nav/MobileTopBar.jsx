import styles from './MobileTopBar.module.css';

export function MobileTopBar({ onMenuOpen, pageTitle }) {
  return (
    <header className={styles.bar}>
      <button className={styles.menuBtn} onClick={onMenuOpen} aria-label="Ouvrir le menu">
        <span className={styles.hamburger} />
        <span className={styles.hamburger} />
        <span className={styles.hamburger} />
      </button>
      <span className={styles.title}>{pageTitle || 'Reprise de Contrôle'}</span>
      <div className={styles.spacer} />
    </header>
  );
}
