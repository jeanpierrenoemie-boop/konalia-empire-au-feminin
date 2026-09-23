import { useState, useEffect, useCallback } from 'react';
import { CadreProgression } from '../../components/cadre/CadreProgression';
import { LoadingState } from '../../components/states/LoadingState';
import { ErrorState } from '../../components/states/ErrorState';
import { SprintOnePanel } from '../../components/sprint1/SprintOnePanel';
import { SprintTwoPanel } from '../../components/sprint2/SprintTwoPanel';
import { SprintThreePanel } from '../../components/sprint3/SprintThreePanel';
import { SprintFourPanel } from '../../components/sprint4/SprintFourPanel';
import { SprintFivePanel } from '../../components/sprint5/SprintFivePanel';
import { SprintSixPanel } from '../../components/sprint6/SprintSixPanel';
import { SprintSevenPanel } from '../../components/sprint7/SprintSevenPanel';
import { SprintEightPanel } from '../../components/sprint8/SprintEightPanel';
import { SprintNinePanel } from '../../components/sprint9/SprintNinePanel';
import { SprintTenPanel } from '../../components/sprint10/SprintTenPanel';
import styles from './ParcoursPage.module.css';
import pageStyles from './Page.module.css';

const STATE_LABELS = {
  passed:      { text: 'Validé', css: 'passed' },
  in_progress: { text: 'En cours', css: 'inProgress' },
  submitted:   { text: 'Soumis', css: 'submitted' },
  blocked:     { text: 'Bloqué', css: 'blocked' },
  locked:      { text: 'Verrouillé', css: 'locked' },
};

const GATE_COLOR = { VERT: 'gateVert', ORANGE: 'gateOrange', ROUGE: 'gateRouge' };

function GatePanel({ gate, sprintNumber, onPass }) {
  const [passing, setPassing] = useState(false);
  const [error, setError] = useState(null);

  async function handlePass() {
    setPassing(true);
    setError(null);
    try {
      const r = await fetch(`/api/parcours/gate/${sprintNumber}/pass`, {
        method: 'POST', credentials: 'include',
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.error ?? 'Erreur lors de la validation');
      } else {
        onPass();
      }
    } catch {
      setError('Erreur réseau');
    } finally {
      setPassing(false);
    }
  }

  const colorCss = GATE_COLOR[gate.status] ?? GATE_COLOR.ROUGE;

  return (
    <div className={`${styles.gatePanel} ${styles[colorCss]}`}>
      <div className={styles.gateTitleRow}>
        <span className={`${styles.gateDot} ${styles[`dot_${colorCss}`]}`} aria-hidden />
        <span className={styles.gateTitle}>
          {gate.status === 'VERT' && 'Prêt à valider'}
          {gate.status === 'ORANGE' && 'Avancement exceptionnel'}
          {gate.status === 'ROUGE' && 'Conditions à remplir'}
        </span>
      </div>

      {gate.override_reason && (
        <p className={styles.overrideReason}>{gate.override_reason}</p>
      )}

      <ul className={styles.conditionList}>
        {gate.conditions.map((c, i) => (
          <li key={i} className={`${styles.condition} ${c.met ? styles.conditionMet : styles.conditionMissing}`}>
            <span className={styles.conditionIcon} aria-hidden>{c.met ? '✓' : '○'}</span>
            {c.label}
          </li>
        ))}
      </ul>

      {gate.status === 'VERT' && (
        <button className={styles.passButton} onClick={handlePass} disabled={passing}>
          {passing ? 'Validation…' : 'Valider ce sprint →'}
        </button>
      )}
      {error && <p className={styles.gateError}>{error}</p>}
    </div>
  );
}

/* ── MissionPanel — loads and renders missions for the current sprint ── */
function MissionPanel({ sprintNumber, onMissionUpdate }) {
  const [missions, setMissions] = useState(null);
  const [submitting, setSubmitting] = useState(null); /* missionId being submitted */
  const [drafts, setDrafts] = useState({});           /* {missionId: text} */
  const [errors, setErrors] = useState({});

  useEffect(() => {
    fetch('/api/parcours/missions', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setMissions)
      .catch(() => setMissions([]));
  }, [sprintNumber]);

  if (missions === null) return <p className={styles.missionLoading}>Chargement des missions…</p>;
  if (missions.length === 0) return null;

  async function submit(missionId) {
    const content = drafts[missionId] ?? '';
    setSubmitting(missionId);
    setErrors(e => ({ ...e, [missionId]: null }));
    try {
      const r = await fetch(`/api/parcours/missions/${missionId}/submit`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErrors(e => ({ ...e, [missionId]: b.error ?? 'Erreur lors de la soumission' }));
      } else {
        setMissions(ms => ms.map(m => m.id === missionId
          ? { ...m, submission_status: 'submitted', submission_content: content } : m));
        setDrafts(d => ({ ...d, [missionId]: undefined }));
        if (onMissionUpdate) onMissionUpdate();
      }
    } catch {
      setErrors(e => ({ ...e, [missionId]: 'Erreur réseau' }));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className={styles.missionPanel}>
      {missions.map(m => {
        const status = m.submission_status;
        return (
          <div key={m.id} className={styles.missionItem}>
            <div className={styles.missionHeader}>
              <span className={styles.missionLabel}>Mission</span>
              {status === 'approved' && <span className={styles.statusApproved}>✓ VALIDÉ</span>}
              {status === 'submitted' && <span className={styles.statusSubmitted}>EN ATTENTE DE VALIDATION</span>}
              {status === 'rejected' && <span className={styles.statusRejected}>CORRECTION DEMANDÉE</span>}
            </div>
            <p className={styles.missionTitle}>{m.title}</p>
            {m.description && <p className={styles.missionDesc}>{m.description}</p>}

            {status === 'rejected' && m.reviewer_note && (
              <div className={styles.correctionNote}>
                <strong>Retour de Noémie :</strong> {m.reviewer_note}
              </div>
            )}

            {status !== 'approved' && (
              <>
                {status === 'submitted' ? (
                  <div className={styles.submittedBox}>
                    <p className={styles.submittedContent}>{m.submission_content}</p>
                    <button
                      className={styles.resubmitBtn}
                      onClick={() => setMissions(ms => ms.map(x =>
                        x.id === m.id ? { ...x, submission_status: 'draft' } : x))}
                    >
                      Modifier ma soumission
                    </button>
                  </div>
                ) : (
                  <>
                    <textarea
                      className={styles.missionTextarea}
                      rows={4}
                      placeholder="Décris ton livrable ici…"
                      value={drafts[m.id] ?? (m.submission_content ?? '')}
                      onChange={e => setDrafts(d => ({ ...d, [m.id]: e.target.value }))}
                    />
                    <button
                      className={styles.submitMissionBtn}
                      onClick={() => submit(m.id)}
                      disabled={submitting === m.id}
                    >
                      {submitting === m.id ? 'Soumission…' : 'Soumettre mon livrable →'}
                    </button>
                    {errors[m.id] && <p className={styles.missionError}>{errors[m.id]}</p>}
                  </>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SprintCard({ sprint, isCurrent, onPass }) {
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
          {isCurrent && sprint.number === 1 && (
            <SprintOnePanel sprint={sprint} onMissionUpdate={onPass} />
          )}
          {isCurrent && sprint.number === 2 && (
            <SprintTwoPanel sprint={sprint} onMissionUpdate={onPass} />
          )}
          {isCurrent && sprint.number === 3 && (
            <SprintThreePanel sprint={sprint} onMissionUpdate={onPass} />
          )}
          {isCurrent && sprint.number === 4 && (
            <SprintFourPanel sprint={sprint} onMissionUpdate={onPass} />
          )}
          {isCurrent && sprint.number === 5 && (
            <SprintFivePanel sprint={sprint} onMissionUpdate={onPass} />
          )}
          {isCurrent && sprint.number === 6 && (
            <SprintSixPanel sprint={sprint} onMissionUpdate={onPass} />
          )}
          {isCurrent && sprint.number === 7 && (
            <SprintSevenPanel sprint={sprint} onMissionUpdate={onPass} />
          )}
          {isCurrent && sprint.number === 8 && (
            <SprintEightPanel sprint={sprint} onMissionUpdate={onPass} />
          )}
          {isCurrent && sprint.number === 9 && (
            <SprintNinePanel sprint={sprint} onMissionUpdate={onPass} />
          )}
          {isCurrent && sprint.number === 10 && (
            <SprintTenPanel sprint={sprint} onMissionUpdate={onPass} />
          )}
          {isCurrent && sprint.number !== 1 && sprint.number !== 2 && sprint.number !== 3 && sprint.number !== 4 && sprint.number !== 5 && sprint.number !== 6 && sprint.number !== 7 && sprint.number !== 8 && sprint.number !== 9 && sprint.number !== 10 && (
            <MissionPanel sprintNumber={sprint.number} onMissionUpdate={onPass} />
          )}
          {isCurrent && sprint.gate && (
            <GatePanel gate={sprint.gate} sprintNumber={sprint.number} onPass={onPass} />
          )}
        </div>
      )}
    </div>
  );
}

function PhaseSection({ phase, sprints, currentSprintNumber, onPass }) {
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
            onPass={onPass}
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

  const load = useCallback(async function load() {
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
  }, []);

  useEffect(() => { load(); }, [load]);

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
            onPass={load}
          />
        ))}
      </div>
    </div>
  );
}
