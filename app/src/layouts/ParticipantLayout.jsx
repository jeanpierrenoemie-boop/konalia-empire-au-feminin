import { useState } from 'react';
import { Outlet, useMatches } from 'react-router-dom';
import { ParticipantNav } from '../components/nav/ParticipantNav';
import { MobileTopBar } from '../components/nav/MobileTopBar';
import styles from './ParticipantLayout.module.css';
// useAuth imported for future use (logout in nav)
import { useIsElite } from '../auth/AuthContext';

export function ParticipantLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
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
    </div>
  );
}
