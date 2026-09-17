import { useState, useEffect } from 'react';
import { CadreProgression } from '../../components/cadre/CadreProgression';
import { LoadingState } from '../../components/states/LoadingState';
import { ErrorState } from '../../components/states/ErrorState';
import styles from './ParcoursPage.module.css';
import pageStyles from './Page.module.css';

const CADRE_LABELS = { C: 'Clarifier', A: 'Arbitrer', D: 'Définir', R: 'Rencontrer', E: 'Évoluer' };

const STATE_LABELS = {
  passed:      { text: 'Validé', css: 'passed' },
  in_progress: { text: 'En cours', css: 'inProgress' },
  submitted:   { text: 'Soumis', css: 'submitted' },
  blocked:     { text: 'Bloqué', css: 'blocked' },
  locked:      { text: 'Verrouillé', css: 'locked' },
};

function SprintCard({ sprint, isCurrent }) {
  const [open, setOpen] = useState(isCurrent);
  const stateInfo = STATE_LABELS[sprint.state] ?? STATE_LABELS.locked;
  const isLocked = sprint.state === 'locked';
  const isPassed = sprint.state === 'passed';

  return (
    <div
      className={`${styles.sprintCard} ${styles[stateInfo.css]} ${isCurrent ? styles.current : ''}`}
      aria-current={isCurrent ? 'step' : undefined}
    >
      <button
        className={styles.sprintHeader}
        onClick={() => !isLocked && setOpen(o => !o)}
        aria-expanded={!isLocked && open}
        disabled={isLocked}
      >
        <span className={styles.sprintNumber}>S{sprint.number}</span>
        <span className={styles.sprintTitle}>{sprint.title}</span>
        <span className={`${styles.stateBadge} ${styles[`badge_${stateInfo.css}`]}`}>
          {stateInfo.text}
        </span>
        {!isLocked && (
          <span className={styles.chevron} aria-hidden>{open ? '▲' : '▼'}</span>
        )}
      </button>

      {isLocked && (
        <div className={styles.lockedReason}>
          <span className={styles.lockIcon}>○</span>
          <span>{sprint.unlock_reason}</span>
        </div>
      )}

      {!isLocked && open && (
        <div className={styles.sprintBody}>
          {sprint.result && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Résultat attendu</h4>
              <p>{sprint.result}</p>
            </section>
          )}
          {sprint.understand && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Ce que tu vas comprendre</h4>
              <p>{sprint.understand}</p>
            </section>
          )}
          {sprint.mission && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Ta mission</h4>
              <p>{sprint.mission}</p>
            </section>
          )}
          {sprint.support && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Support & modèle</h4>
              <p>{sprint.support}</p>
            </section>
          )}
          {sprint.deliverable && (
            <section className={styles.section}>
              <h4 className={styles.sectionTitle}>Livrable</h4>
              <p>{sprint.deliverable}</p>
            </section>
          )}
          {!sprint.result && !sprint.understand && !sprint.mission && (
            <p className={styles.contentPending}>
              Le contenu de ce sprint sera disponible prochainement.
            </p>
          )}
          {isPassed && (
            <div className={styles.passedNote}>
              Sprint validé — ce contenu reste accessible à tout moment.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PhaseSection({ phase, sprints, currentSprintNumber }) {
  const phaseSpints = sprints.filter(s => s.cadre_step === phase.step);
  return (
    <section className={`${styles.phase} ${styles[`phase_${phase.state}`]}`}>
      <div className={styles.phaseHeader}>
        <span className={styles.phaseLetter}>{phase.step}</span>
        <div className={styles.phaseInfo}>
          <h2 className={styles.phaseLabel}>{phase.label}</h2>
          <span className={styles.phaseProgress}>
            {phase.passed_count}/{phase.total_count} sprint{phase.total_count > 1 ? 's' : ''} validé{phase.passed_count > 1 ? 's' : ''}
          </span>
        </div>
        <div className={`${styles.phaseState} ${styles[`phaseState_${phase.state}`]}`}>
          {phase.state === 'done' ? 'Étape complète' : phase.state === 'active' ? 'En cours' : 'À venir'}
        </div>
      </div>
      <div className={styles.sprintList}>
        {phaseSpints.map(sprint => (
          <SprintCard
            key={sprint.number}
            sprint={sprint}
            isCurrent={sprint.number === currentSprintNumber}
          />
        ))}
      </div>
    </section>
  );
}

export function ParcoursPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/parcours', { credentials: 'include' });
      if (!r.ok) throw new Error('Erreur lors du chargement du parcours');
      setData(await r.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const currentStep = data?.phases?.find(p =>
    data.sprints?.find(s => s.number === data.currentSprintNumber)?.cadre_step === p.step
  )?.step ?? null;

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.header}>
        <h1 className={pageStyles.title}>Mon Parcours</h1>
      </div>

      <div className={pageStyles.cadreSection}>
        <p className={pageStyles.sectionLabel}>Progression C.A.D.R.E.</p>
        <CadreProgression currentStep={currentStep} />
      </div>

      <div className={styles.phases}>
        {data.phases.map(phase => (
          <PhaseSection
            key={phase.step}
            phase={phase}
            sprints={data.sprints}
            currentSprintNumber={data.currentSprintNumber}
          />
        ))}
      </div>
    </div>
  );
}
