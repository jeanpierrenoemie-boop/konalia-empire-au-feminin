import { useAuth } from '../../auth/AuthContext';
import { useCockpit } from './useCockpit';
import { LoadingState } from '../../components/states/LoadingState';
import { ErrorState } from '../../components/states/ErrorState';
import { CadreHeader } from './cockpit/CadreHeader';
import { PilotageBlock } from './cockpit/PilotageBlock';
import { MissionBlock } from './cockpit/MissionBlock';
import { ProofsBar } from './cockpit/ProofsBar';
import { LastDecision } from './cockpit/LastDecision';
import { LastMarketAction } from './cockpit/LastMarketAction';
import { PasMaintenantBlock } from './cockpit/PasMaintenantBlock';
import { CockpitCTA } from './cockpit/CockpitCTA';
import styles from './CockpitPage.module.css';

export function CockpitPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useCockpit();

  if (loading) return <LoadingState label="Chargement du cockpit…" />;
  if (error)   return <ErrorState title="Erreur de chargement" message={error} onRetry={reload} />;

  const {
    progress, pilotage, currentMission,
    proofs, totalProofs,
    lastDecision, lastMarketAction,
    parkingCount, openSupportCount,
  } = data ?? {};

  return (
    <div className={styles.page}>
      {/* Page title */}
      <div className={styles.pageHeader}>
        <h1 className={styles.greeting}>
          {greeting(user?.first_name)}
        </h1>
      </div>

      {/* 1. Où j'en suis — C.A.D.R.E. phase + semaine */}
      <CadreHeader progress={progress} />

      {/* 2+3+4+5 — Priorité / Raison / Prochaine action / Blocage */}
      <PilotageBlock pilotage={pilotage} />

      {/* Mission en cours */}
      <MissionBlock mission={currentMission} />

      {/* Preuves */}
      <ProofsBar proofs={proofs ?? []} total={totalProofs ?? 0} />

      {/* Dernière décision */}
      <LastDecision decision={lastDecision} />

      {/* Dernière action marché */}
      <LastMarketAction action={lastMarketAction} />

      {/* PAS MAINTENANT */}
      <PasMaintenantBlock pilotage={pilotage} parkingCount={parkingCount ?? 0} />

      {/* CTA fixes */}
      <CockpitCTA openSupportCount={openSupportCount ?? 0} />
    </div>
  );
}

function greeting(firstName) {
  const hour = new Date().getHours();
  const salut = hour < 18 ? 'Bonjour' : 'Bonsoir';
  return firstName ? `${salut}, ${firstName}.` : `${salut}.`;
}
