import { NavLink } from 'react-router-dom';
import styles from './ParticipantNav.module.css';

const NAV_ITEMS = [
  { path: '/cockpit',   label: 'Mon Cockpit',   icon: '⊙' },
  { path: '/parcours',  label: 'Mon Parcours',  icon: '◈' },
  { path: '/copilote',  label: 'COPILOTE',      icon: '✦' },
  { path: '/labs',      label: 'Mes Labs',      icon: '⬡' },
  { path: '/qg',        label: 'Le QG',         icon: '◎' },
  { path: '/ressources',label: 'Mes Ressources',icon: '◫' },
];

export function ParticipantNav({ isElite = false, mobileOpen, onClose }) {
  return (
    <>
      {mobileOpen && <div className={styles.backdrop} onClick={onClose} />}
      <nav className={`${styles.nav} ${mobileOpen ? styles.open : ''}`} aria-label="Navigation principale">
        <div className={styles.logo}>
          <span className={styles.logoMark}>RC</span>
          <span className={styles.logoText}>Reprise de Contrôle</span>
        </div>

        <ul className={styles.list} role="list">
          {NAV_ITEMS.map(item => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `${styles.item} ${isActive ? styles.active : ''}`
                }
                onClick={onClose}
              >
                <span className={styles.icon} aria-hidden="true">{item.icon}</span>
                <span className={styles.label}>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        {isElite && (
          <div className={styles.eliteSection}>
            <NavLink to="/elite" className={({ isActive }) =>
              `${styles.item} ${styles.elite} ${isActive ? styles.active : ''}`
            } onClick={onClose}>
              <span className={styles.icon} aria-hidden="true">◆</span>
              <span className={styles.label}>Mes Points ELITE</span>
            </NavLink>
          </div>
        )}

        <div className={styles.footer}>
          <NavLink to="/preuves" className={({ isActive }) =>
            `${styles.preuves} ${isActive ? styles.active : ''}`
          } onClick={onClose}>
            <span>Mes Preuves</span>
          </NavLink>
        </div>
      </nav>
    </>
  );
}
