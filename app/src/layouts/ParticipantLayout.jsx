import { useState } from 'react';
import { Outlet, useMatches } from 'react-router-dom';
import { ParticipantNav } from '../components/nav/ParticipantNav';
import { MobileTopBar } from '../components/nav/MobileTopBar';
import { SignalerModal } from '../components/frictions/SignalerModal';
import styles from './ParticipantLayout.module.css';
import { useIsElite } from '../auth/AuthContext';

export function ParticipantLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signalerOpen, setSignalerOpen] = useState(false);
  const matches = useMatches();
  const currentMatch = matches[matches.length - 1];
  const pageTitle = currentMatch?.handle?.title;
  const isElite = useIsElite();

  return (
    <div className={styles.shell}>
      <MobileTopBar
        onMenuOpen={() => setMobileOpen(true)}
        pageTitle={pageTitle}
      />
      <ParticipantNav
        isElite={isElite}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <main className={styles.main}>
        <Outlet />
      </main>

      <button
        className={styles.signalerFab}
        onClick={() => setSignalerOpen(true)}
        aria-label="Signaler un problème"
      >
        <span className={styles.fabIcon}>⚑</span>
        <span className={styles.fabLabel}>Signaler un problème</span>
      </button>

      {signalerOpen && <SignalerModal onClose={() => setSignalerOpen(false)} />}
    </div>
  );
}
