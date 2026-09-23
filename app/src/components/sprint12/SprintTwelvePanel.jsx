import { useState, useEffect, useCallback } from 'react';
import styles from './SprintTwelvePanel.module.css';

const STEPS = [
  { id: 1, label: 'DÉCISION S11' },
  { id: 2, label: 'CAP 90J' },
  { id: 3, label: 'PRIORITÉ' },
  { id: 4, label: 'J1–30' },
  { id: 5, label: 'J31–60' },
  { id: 6, label: 'J61–90' },
  { id: 7, label: 'RYTHME' },
  { id: 8, label: 'CHECKPOINTS' },
  { id: 9, label: 'ANTI-ABANDON' },
  { id: 10, label: 'ENGAGEMENT' },
];

const DECISION_LABELS = {
  go: 'GO — Continuer cette piste',
  no_go: 'NO-GO — Ne pas poursuivre dans cette forme',
  continue_tests: 'CONTINUER LES TESTS — Réévaluer avec plus de données',
};

function DecisionBadge({ decision }) {
  if (!decision) return null;
  const cls = decision === 'go' ? styles.badgeGo
    : decision === 'no_go' ? styles.badgeNogo
    : styles.badgeContinue;
  return (
    <span className={`${styles.decisionBadge} ${cls}`}>
      {DECISION_LABELS[decision] ?? decision}
    </span>
  );
}

function AcknowledgeField({ label, hint, value, onChange, disabled }) {
  return (
    <div className={`${styles.ackField} ${value ? styles.ackFieldTreated : ''}`}>
      <div className={styles.ackFieldHeader}>
        <span className={styles.ackFieldLabel}>{label}</span>
        {value && <span className={styles.ackCheck}>✓</span>}
      </div>
      {hint && <p className={styles.fieldHint}>{hint}</p>}
      {value ? (
        <div className={styles.ackAcknowledged}>
          <span>Pris en compte</span>
          {!disabled && (
            <button className={styles.ackUndoBtn} onClick={() => onChange(false)}>
              Annuler
            </button>
          )}
        </div>
      ) : (
        <button className={styles.ackBtn} onClick={() => onChange(true)} disabled={disabled}>
          Je prends en compte →
        </button>
      )}
    </div>
  );
}

export function SprintTwelvePanel({ sprint, onMissionUpdate }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState(null);
  const [s11Refs, setS11Refs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [newIndicator, setNewIndicator] = useState('');

  useEffect(() => {
    fetch('/api/s12/continuity-plan', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(body => {
        setS11Refs(body.s11_refs ?? null);
        const d = body.s12 ?? {};
        setData({
          ninety_day_goal: d.ninety_day_goal ?? '',
          ninety_day_why: d.ninety_day_why ?? '',
          ninety_day_observable: d.ninety_day_observable ?? '',
          not_priority: d.not_priority ?? '',
          priority: d.priority ?? '',
          phases: {
            days_1_30: {
              objective: d.phases?.days_1_30?.objective ?? '',
              actions: d.phases?.days_1_30?.actions ?? '',
              success_signal: d.phases?.days_1_30?.success_signal ?? '',
            },
            days_31_60: {
              objective: d.phases?.days_31_60?.objective ?? '',
              actions: d.phases?.days_31_60?.actions ?? '',
              success_signal: d.phases?.days_31_60?.success_signal ?? '',
            },
            days_61_90: {
              objective: d.phases?.days_61_90?.objective ?? '',
              actions: d.phases?.days_61_90?.actions ?? '',
              success_signal: d.phases?.days_61_90?.success_signal ?? '',
            },
          },
          weekly_rhythm: {
            hours_available: d.weekly_rhythm?.hours_available ?? '',
            preferred_slots: d.weekly_rhythm?.preferred_slots ?? '',
            minimum_viable_week: d.weekly_rhythm?.minimum_viable_week ?? '',
          },
          tracking_indicators: d.tracking_indicators ?? [],
          checkpoints: {
            day_30: {
              what_done: d.checkpoints?.day_30?.what_done ?? '',
              reassessment_question: d.checkpoints?.day_30?.reassessment_question ?? '',
            },
            day_60: {
              what_done: d.checkpoints?.day_60?.what_done ?? '',
              reassessment_question: d.checkpoints?.day_60?.reassessment_question ?? '',
            },
            day_90: {
              what_done: d.checkpoints?.day_90?.what_done ?? '',
              final_assessment: d.checkpoints?.day_90?.final_assessment ?? '',
            },
          },
          reopening_conditions: d.reopening_conditions ?? '',
          friction_plan: {
            expected_obstacles: d.friction_plan?.expected_obstacles ?? '',
            if_blocked: d.friction_plan?.if_blocked ?? '',
            minimum_commitment: d.friction_plan?.minimum_commitment ?? '',
          },
          next_action: d.next_action ?? '',
          epistemic_plan_not_prediction: d.epistemic_plan_not_prediction ?? false,
          epistemic_goal_not_guarantee: d.epistemic_goal_not_guarantee ?? false,
          epistemic_commitment_not_certainty: d.epistemic_commitment_not_certainty ?? false,
          status: d.status ?? 'draft',
        });
        if (d.status === 'submitted') setSubmitted(true);
      })
      .catch(() => setLoadError('Impossible de charger les données S12. Vérifiez que votre décision S11 est soumise.'))
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async (patch) => {
    if (submitted) return;
    setSaving(true);
    try {
      await fetch('/api/s12/continuity-plan', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } finally {
      setSaving(false);
    }
  }, [submitted]);

  function update(patch) {
    setData(d => ({ ...d, ...patch }));
  }

  function updatePhase(phase, field, value) {
    setData(d => ({
      ...d,
      phases: { ...d.phases, [phase]: { ...d.phases[phase], [field]: value } },
    }));
  }

  function savePhase(phase) {
    save({ phases: { ...data.phases } });
  }

  function updateWeekly(field, value) {
    setData(d => ({
      ...d,
      weekly_rhythm: { ...d.weekly_rhythm, [field]: value },
    }));
  }

  function saveWeekly() {
    save({ weekly_rhythm: { ...data.weekly_rhythm } });
  }

  function updateCheckpoint(cp, field, value) {
    setData(d => ({
      ...d,
      checkpoints: { ...d.checkpoints, [cp]: { ...d.checkpoints[cp], [field]: value } },
    }));
  }

  function saveCheckpoints() {
    save({ checkpoints: { ...data.checkpoints } });
  }

  function updateFriction(field, value) {
    setData(d => ({
      ...d,
      friction_plan: { ...d.friction_plan, [field]: value },
    }));
  }

  function saveFriction() {
    save({ friction_plan: { ...data.friction_plan } });
  }

  function addIndicator(v) {
    const trimmed = v.trim();
    if (!trimmed) return;
    const arr = [...data.tracking_indicators, trimmed];
    setNewIndicator('');
    setData(d => ({ ...d, tracking_indicators: arr }));
    save({ tracking_indicators: arr });
  }

  function removeIndicator(idx) {
    const arr = data.tracking_indicators.filter((_, i) => i !== idx);
    setData(d => ({ ...d, tracking_indicators: arr }));
    save({ tracking_indicators: arr });
  }

  async function handleSubmit() {
    setSubmitError(null);
    try {
      const r = await fetch('/api/s12/continuity-plan/submit', {
        method: 'POST',
        credentials: 'include',
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setSubmitError(b.error ?? 'Erreur lors de la soumission');
      } else {
        setSubmitted(true);
        if (onMissionUpdate) onMissionUpdate();
      }
    } catch {
      setSubmitError('Erreur réseau');
    }
  }

  function isStepDone(s) {
    if (!data) return false;
    if (s === 1) return !!(s11Refs?.decision);
    if (s === 2) return !!(data.ninety_day_goal?.trim());
    if (s === 3) return !!(data.priority?.trim());
    if (s === 4) return !!(data.phases.days_1_30.objective?.trim()) && !!(data.phases.days_1_30.actions?.trim());
    if (s === 5) return !!(data.phases.days_31_60.objective?.trim());
    if (s === 6) return !!(data.phases.days_61_90.objective?.trim());
    if (s === 7) return !!(data.weekly_rhythm.hours_available) && data.tracking_indicators.length > 0;
    if (s === 8) return !!(data.checkpoints.day_30.what_done?.trim());
    if (s === 9) return !!(data.friction_plan.expected_obstacles?.trim());
    if (s === 10) return !!(data.next_action?.trim()) && data.epistemic_plan_not_prediction && data.epistemic_goal_not_guarantee && data.epistemic_commitment_not_certainty;
    return false;
  }

  const canSubmit = data && isStepDone(2) && isStepDone(3) && isStepDone(4) && isStepDone(7) && isStepDone(10);

  if (loading) return <p className={styles.loading}>Chargement…</p>;
  if (loadError) return <div className={styles.errorBox}>{loadError}</div>;
  if (!data) return null;

  const isSubmitted = submitted || data.status === 'submitted';

  if (isSubmitted) {
    return (
      <div className={styles.panel}>
        <div className={styles.successBox}>
          <span className={styles.successIcon}>✓</span>
          <span>Plan de continuité enregistré — Sprint 12 soumis. La suite est sous contrôle.</span>
        </div>
      </div>
    );
  }

  const s11 = s11Refs;

  return (
    <div className={styles.panel}>
      <div className={styles.progressBar}>
        {STEPS.map(s => (
          <button
            key={s.id}
            className={`${styles.stepBtn} ${step === s.id ? styles.stepActive : ''} ${isStepDone(s.id) && step !== s.id ? styles.stepDone : ''}`}
            onClick={() => setStep(s.id)}
          >
            <span className={styles.stepNum}>{s.id}</span>
            <span className={styles.stepLabel}>{s.label}</span>
          </button>
        ))}
      </div>

      <div className={styles.content}>

        {/* STEP 1 — Décision S11 */}
        {step === 1 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Ta décision de départ</h3>
            <p className={styles.sectionHint}>
              Ton plan des 90 prochains jours s'appuie sur la décision que tu as prise en Sprint 11. Elle reste valide quelle que soit son orientation.
            </p>

            {s11 ? (
              <>
                <div className={styles.sourceCard}>
                  <span className={styles.sourceLabel}>Décision S11</span>
                  <DecisionBadge decision={s11.decision} />
                  {s11.justification && (
                    <>
                      <span className={styles.sourceLabel}>Justification</span>
                      <span className={styles.sourceValue}>{s11.justification}</span>
                    </>
                  )}
                  {s11.nextAction && (
                    <>
                      <span className={styles.sourceLabel}>Prochaine action notée</span>
                      <span className={styles.sourceValue}>{s11.nextAction}</span>
                    </>
                  )}
                </div>

                <div className={styles.doctrineBox}>
                  <strong>Ce que signifie ta décision</strong>
                  {s11.decision === 'go' && (
                    <p>GO → Ton plan 90J est une poursuite progressive. Tu continues à tester, affiner et documenter. Pas une garantie de revenu.</p>
                  )}
                  {s11.decision === 'no_go' && (
                    <p>NO-GO → Ton plan 90J est une fermeture propre et un repositionnement. Aucun échec ici — tu as appris ce que tu devais apprendre.</p>
                  )}
                  {s11.decision === 'continue_tests' && (
                    <p>CONTINUER LES TESTS → Ton plan 90J est structuré autour de nouvelles données à collecter et d'une réévaluation à J90.</p>
                  )}
                </div>
              </>
            ) : (
              <p className={styles.sectionHint}>Décision S11 non disponible.</p>
            )}

            <div className={styles.epNote}>
              Toutes les décisions S11 sont compatibles avec la graduation. Le programme récompense ton processus, pas ton résultat commercial.
            </div>
          </div>
        )}

        {/* STEP 2 — Cap 90 jours */}
        {step === 2 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Ton cap à 90 jours</h3>
            <p className={styles.sectionHint}>
              Un objectif principal, réaliste et observable d'ici 90 jours. Pas une promesse — une direction.
            </p>
            <label className={styles.label}>
              Objectif principal à 90 jours
              <textarea
                className={styles.textarea}
                rows={3}
                placeholder="Ex : Avoir conduit 5 nouvelles conversations terrain avec ma cible et revu mon offre en conséquence…"
                value={data.ninety_day_goal}
                onChange={e => update({ ninety_day_goal: e.target.value })}
                onBlur={e => save({ ninety_day_goal: e.target.value })}
              />
            </label>
            <label className={styles.label}>
              Pourquoi cet objectif est important maintenant
              <textarea
                className={styles.textarea}
                rows={2}
                placeholder="Ce que tu cherches à comprendre ou à accomplir dans cette période…"
                value={data.ninety_day_why}
                onChange={e => update({ ninety_day_why: e.target.value })}
                onBlur={e => save({ ninety_day_why: e.target.value })}
              />
            </label>
            <label className={styles.label}>
              Comment tu sauras que c'est accompli (signal observable)
              <textarea
                className={styles.textarea}
                rows={2}
                placeholder="Ex : J'aurai X réponses terrain documentées / J'aurai décidé d'un repositionnement…"
                value={data.ninety_day_observable}
                onChange={e => update({ ninety_day_observable: e.target.value })}
                onBlur={e => save({ ninety_day_observable: e.target.value })}
              />
            </label>
            <label className={styles.label}>
              Ce qui n'est PAS une priorité sur cette période
              <textarea
                className={styles.textarea}
                rows={2}
                placeholder="Ce que tu mets délibérément de côté pour rester focalisée…"
                value={data.not_priority}
                onChange={e => update({ not_priority: e.target.value })}
                onBlur={e => save({ not_priority: e.target.value })}
              />
            </label>
            <div className={styles.epNote}>
              OBJECTIF ≠ GARANTIE. Ton plan vise une direction, pas un résultat certain.
            </div>
          </div>
        )}

        {/* STEP 3 — Priorité dominante */}
        {step === 3 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Ta priorité dominante</h3>
            <p className={styles.sectionHint}>
              Si tu ne pouvais faire qu'une chose sur 90 jours, ce serait quoi ?
            </p>
            <label className={styles.label}>
              Priorité principale
              <textarea
                className={styles.textarea}
                rows={4}
                placeholder="Ex : Conduire 10 conversations terrain de qualité avec des dirigeantes de PME / Finaliser mon offre de service et la tester avec 3 clientes potentielles…"
                value={data.priority}
                onChange={e => update({ priority: e.target.value })}
                onBlur={e => save({ priority: e.target.value })}
              />
            </label>
            <div className={styles.doctrineBox}>
              <strong>Doctrine : une priorité, pas une liste</strong>
              <p>Une priorité dominante protège ton énergie et ton attention. Elle ne remplace pas tes autres engagements — elle les oriente.</p>
            </div>
          </div>
        )}

        {/* STEP 4 — Jours 1–30 */}
        {step === 4 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Tes 30 premiers jours</h3>
            <p className={styles.sectionHint}>
              La phase de lancement. Actions concrètes, premiers signaux attendus.
            </p>
            <div className={styles.phaseCard}>
              <span className={styles.phaseTitle}>Phase J1–J30</span>
              <label className={styles.label}>
                Objectif de phase
                <textarea
                  className={styles.textarea}
                  rows={2}
                  placeholder="Ce que tu veux avoir réalisé à J30…"
                  value={data.phases.days_1_30.objective}
                  onChange={e => updatePhase('days_1_30', 'objective', e.target.value)}
                  onBlur={() => savePhase('days_1_30')}
                />
              </label>
              <label className={styles.label}>
                Actions concrètes (1–3 actions clés)
                <textarea
                  className={styles.textarea}
                  rows={3}
                  placeholder="Ex : Contacter 5 personnes de ma cible / Réécrire ma proposition de valeur / Organiser un atelier test…"
                  value={data.phases.days_1_30.actions}
                  onChange={e => updatePhase('days_1_30', 'actions', e.target.value)}
                  onBlur={() => savePhase('days_1_30')}
                />
              </label>
              <label className={styles.label}>
                Signal que la phase est sur la bonne voie
                <textarea
                  className={styles.textarea}
                  rows={2}
                  placeholder="Comment tu sauras à J30 que tu avances dans la bonne direction…"
                  value={data.phases.days_1_30.success_signal}
                  onChange={e => updatePhase('days_1_30', 'success_signal', e.target.value)}
                  onBlur={() => savePhase('days_1_30')}
                />
              </label>
            </div>
          </div>
        )}

        {/* STEP 5 — Jours 31–60 */}
        {step === 5 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Jours 31–60</h3>
            <p className={styles.sectionHint}>
              La phase d'ajustement. Tu t'appuies sur ce que J30 t'a appris.
            </p>
            <div className={styles.phaseCard}>
              <span className={styles.phaseTitle}>Phase J31–J60</span>
              <label className={styles.label}>
                Objectif de phase
                <textarea
                  className={styles.textarea}
                  rows={2}
                  placeholder="Ce que tu veux avoir réalisé à J60…"
                  value={data.phases.days_31_60.objective}
                  onChange={e => updatePhase('days_31_60', 'objective', e.target.value)}
                  onBlur={() => savePhase('days_31_60')}
                />
              </label>
              <label className={styles.label}>
                Actions prévues
                <textarea
                  className={styles.textarea}
                  rows={3}
                  placeholder="Les actions principales de cette phase, qui s'appuient sur ce que J30 t'a appris…"
                  value={data.phases.days_31_60.actions}
                  onChange={e => updatePhase('days_31_60', 'actions', e.target.value)}
                  onBlur={() => savePhase('days_31_60')}
                />
              </label>
              <label className={styles.label}>
                Signal de progression
                <textarea
                  className={styles.textarea}
                  rows={2}
                  placeholder="Comment tu sauras à J60 que tu avances…"
                  value={data.phases.days_31_60.success_signal}
                  onChange={e => updatePhase('days_31_60', 'success_signal', e.target.value)}
                  onBlur={() => savePhase('days_31_60')}
                />
              </label>
            </div>
            <div className={styles.epNote}>
              Cette phase peut évoluer en fonction de ce que tu auras appris à J30. C'est normal.
            </div>
          </div>
        )}

        {/* STEP 6 — Jours 61–90 */}
        {step === 6 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Jours 61–90</h3>
            <p className={styles.sectionHint}>
              La phase de décision. Tu consolides, tu évalues, tu décides de la suite.
            </p>
            <div className={styles.phaseCard}>
              <span className={styles.phaseTitle}>Phase J61–J90</span>
              <label className={styles.label}>
                Objectif de phase
                <textarea
                  className={styles.textarea}
                  rows={2}
                  placeholder="Ce que tu veux avoir accompli à J90…"
                  value={data.phases.days_61_90.objective}
                  onChange={e => updatePhase('days_61_90', 'objective', e.target.value)}
                  onBlur={() => savePhase('days_61_90')}
                />
              </label>
              <label className={styles.label}>
                Actions de consolidation
                <textarea
                  className={styles.textarea}
                  rows={3}
                  placeholder="Ce que tu feras pour consolider les acquis et préparer la décision finale…"
                  value={data.phases.days_61_90.actions}
                  onChange={e => updatePhase('days_61_90', 'actions', e.target.value)}
                  onBlur={() => savePhase('days_61_90')}
                />
              </label>
              <label className={styles.label}>
                Question de clôture à J90
                <textarea
                  className={styles.textarea}
                  rows={2}
                  placeholder="La question principale à laquelle tu veux pouvoir répondre à J90…"
                  value={data.phases.days_61_90.success_signal}
                  onChange={e => updatePhase('days_61_90', 'success_signal', e.target.value)}
                  onBlur={() => savePhase('days_61_90')}
                />
              </label>
            </div>
          </div>
        )}

        {/* STEP 7 — Rythme & indicateurs */}
        {step === 7 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Ton rythme &amp; tes indicateurs</h3>
            <p className={styles.sectionHint}>
              Un engagement réaliste sur ton temps disponible, et les signaux concrets qui te montrent que tu avances.
            </p>

            <label className={styles.label}>
              Heures disponibles par semaine (estimation réaliste)
              <input
                type="number"
                min="0"
                max="40"
                className={styles.input}
                placeholder="Ex : 4"
                value={data.weekly_rhythm.hours_available}
                onChange={e => updateWeekly('hours_available', e.target.value)}
                onBlur={saveWeekly}
              />
            </label>
            <label className={styles.label}>
              Créneaux préférés
              <input
                className={styles.input}
                placeholder="Ex : Mardis soir + samedi matin"
                value={data.weekly_rhythm.preferred_slots}
                onChange={e => updateWeekly('preferred_slots', e.target.value)}
                onBlur={saveWeekly}
              />
            </label>
            <label className={styles.label}>
              Semaine minimale viable (si semaine difficile)
              <input
                className={styles.input}
                placeholder="Ex : Au minimum 1h de contact terrain ou 1 revue de notes"
                value={data.weekly_rhythm.minimum_viable_week}
                onChange={e => updateWeekly('minimum_viable_week', e.target.value)}
                onBlur={saveWeekly}
              />
            </label>

            <div className={styles.label}>
              Indicateurs de progression (au moins 1)
              <div className={styles.tagsContainer}>
                {data.tracking_indicators.map((t, i) => (
                  <span key={i} className={styles.tag}>
                    {t}
                    <button className={styles.tagRemove} onClick={() => removeIndicator(i)} aria-label="Retirer">×</button>
                  </span>
                ))}
              </div>
              <div className={styles.tagInput}>
                <input
                  className={styles.input}
                  placeholder="Ex : Nombre de conversations conduites / Offre testée avec X personnes…"
                  value={newIndicator}
                  onChange={e => setNewIndicator(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addIndicator(newIndicator)}
                />
                <button className={styles.addBtn} onClick={() => addIndicator(newIndicator)}>+</button>
              </div>
            </div>

            <div className={styles.epNote}>
              ENGAGEMENT ≠ CERTITUDE. Ton rythme peut fluctuer — ce qui compte c'est la direction, pas la régularité parfaite.
            </div>
          </div>
        )}

        {/* STEP 8 — Checkpoints */}
        {step === 8 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Tes checkpoints</h3>
            <p className={styles.sectionHint}>
              Trois rendez-vous avec toi-même pour évaluer où tu en es et ajuster si nécessaire.
            </p>

            <div className={styles.phaseCard}>
              <span className={styles.phaseTitle}>Checkpoint J30</span>
              <label className={styles.label}>
                Ce que tu auras fait
                <textarea
                  className={styles.textarea}
                  rows={2}
                  placeholder="Les actions concrètes réalisées d'ici J30…"
                  value={data.checkpoints.day_30.what_done}
                  onChange={e => updateCheckpoint('day_30', 'what_done', e.target.value)}
                  onBlur={saveCheckpoints}
                />
              </label>
              <label className={styles.label}>
                Question de réévaluation
                <input
                  className={styles.input}
                  placeholder="Ex : Est-ce que je maintiens cette direction pour J60 ?"
                  value={data.checkpoints.day_30.reassessment_question}
                  onChange={e => updateCheckpoint('day_30', 'reassessment_question', e.target.value)}
                  onBlur={saveCheckpoints}
                />
              </label>
            </div>

            <div className={styles.phaseCard}>
              <span className={styles.phaseTitle}>Checkpoint J60</span>
              <label className={styles.label}>
                Ce que tu auras fait
                <textarea
                  className={styles.textarea}
                  rows={2}
                  placeholder="Les actions concrètes réalisées entre J30 et J60…"
                  value={data.checkpoints.day_60.what_done}
                  onChange={e => updateCheckpoint('day_60', 'what_done', e.target.value)}
                  onBlur={saveCheckpoints}
                />
              </label>
              <label className={styles.label}>
                Question de réévaluation
                <input
                  className={styles.input}
                  placeholder="Ex : Est-ce que le cap à 90J est encore le bon ?"
                  value={data.checkpoints.day_60.reassessment_question}
                  onChange={e => updateCheckpoint('day_60', 'reassessment_question', e.target.value)}
                  onBlur={saveCheckpoints}
                />
              </label>
            </div>

            <div className={styles.phaseCard}>
              <span className={styles.phaseTitle}>Checkpoint J90 — Clôture</span>
              <label className={styles.label}>
                Ce que tu auras accompli
                <textarea
                  className={styles.textarea}
                  rows={2}
                  placeholder="Le bilan à 90 jours…"
                  value={data.checkpoints.day_90.what_done}
                  onChange={e => updateCheckpoint('day_90', 'what_done', e.target.value)}
                  onBlur={saveCheckpoints}
                />
              </label>
              <label className={styles.label}>
                Évaluation finale
                <input
                  className={styles.input}
                  placeholder="Ex : La question à laquelle tu sauras répondre à J90"
                  value={data.checkpoints.day_90.final_assessment}
                  onChange={e => updateCheckpoint('day_90', 'final_assessment', e.target.value)}
                  onBlur={saveCheckpoints}
                />
              </label>
            </div>
          </div>
        )}

        {/* STEP 9 — Plan anti-abandon */}
        {step === 9 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Ton plan anti-abandon</h3>
            <p className={styles.sectionHint}>
              Les obstacles prévisibles et comment tu les gères avant qu'ils n'arrivent.
            </p>
            <label className={styles.label}>
              Obstacles attendus
              <textarea
                className={styles.textarea}
                rows={3}
                placeholder="Ex : Semaines chargées au travail, manque de motivation, doutes sur la direction, vie familiale…"
                value={data.friction_plan.expected_obstacles}
                onChange={e => updateFriction('expected_obstacles', e.target.value)}
                onBlur={saveFriction}
              />
            </label>
            <label className={styles.label}>
              Si je suis bloquée, je fais…
              <textarea
                className={styles.textarea}
                rows={3}
                placeholder="Ex : Je reviens à ma priorité dominante / J'appelle une personne de confiance / Je réduis à l'action minimale…"
                value={data.friction_plan.if_blocked}
                onChange={e => updateFriction('if_blocked', e.target.value)}
                onBlur={saveFriction}
              />
            </label>
            <label className={styles.label}>
              Mon engagement minimum (semaine difficile)
              <textarea
                className={styles.textarea}
                rows={2}
                placeholder="La chose la plus petite que je peux faire même quand tout va mal…"
                value={data.friction_plan.minimum_commitment}
                onChange={e => updateFriction('minimum_commitment', e.target.value)}
                onBlur={saveFriction}
              />
            </label>
            <label className={styles.label}>
              Conditions qui me feraient rouvrir la décision S11
              <textarea
                className={styles.textarea}
                rows={2}
                placeholder="Ex : Si à J60 aucune personne n'a répondu positivement à mon approche révisée…"
                value={data.reopening_conditions}
                onChange={e => update({ reopening_conditions: e.target.value })}
                onBlur={e => save({ reopening_conditions: e.target.value })}
              />
            </label>
          </div>
        )}

        {/* STEP 10 — Engagement */}
        {step === 10 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Ton engagement</h3>
            <p className={styles.sectionHint}>
              La prochaine action concrète et les trois reconnaissances épistémiques qui fondent ton plan.
            </p>
            <label className={styles.label}>
              Première action concrète (dans les 48h)
              <textarea
                className={styles.textarea}
                rows={3}
                placeholder="La première chose que tu vas faire dès demain pour démarrer ce plan…"
                value={data.next_action}
                onChange={e => update({ next_action: e.target.value })}
                onBlur={e => save({ next_action: e.target.value })}
              />
            </label>

            <AcknowledgeField
              label="PLAN ≠ PRÉDICTION"
              hint="Mon plan 90J définit une direction et des actions, pas un résultat garanti. Je l'ajusterai au fil des données."
              value={data.epistemic_plan_not_prediction}
              onChange={v => { update({ epistemic_plan_not_prediction: v }); save({ epistemic_plan_not_prediction: v }); }}
              disabled={isSubmitted}
            />
            <AcknowledgeField
              label="OBJECTIF ≠ GARANTIE"
              hint="Mon objectif à 90J est une cible réaliste fondée sur mes ressources actuelles, pas une promesse de résultat."
              value={data.epistemic_goal_not_guarantee}
              onChange={v => { update({ epistemic_goal_not_guarantee: v }); save({ epistemic_goal_not_guarantee: v }); }}
              disabled={isSubmitted}
            />
            <AcknowledgeField
              label="ENGAGEMENT ≠ CERTITUDE"
              hint="Je m'engage sur des actions et une direction. Je n'ai pas la certitude du résultat — et c'est acceptable."
              value={data.epistemic_commitment_not_certainty}
              onChange={v => { update({ epistemic_commitment_not_certainty: v }); save({ epistemic_commitment_not_certainty: v }); }}
              disabled={isSubmitted}
            />

            <div className={styles.doctrineBox}>
              <strong>Ton plan n'a pas besoin d'être parfait</strong>
              <p>Il doit être suffisamment clair et réaliste pour que tu puisses continuer à avancer. La clarté vient de l'action, pas de la planification parfaite.</p>
            </div>

            <div className={styles.submitArea}>
              <button
                className={styles.submitBtn}
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                Soumettre mon plan de continuité →
              </button>
              <p className={styles.submitNote}>
                Une décision de continuité stratégique sera enregistrée. Ton programme se termine — la suite commence maintenant.
              </p>
              {submitError && <p className={styles.submitError}>{submitError}</p>}
            </div>
          </div>
        )}
      </div>

      <div className={styles.nav}>
        <button className={styles.navBtn} onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}>
          ← Précédent
        </button>
        {saving && <span className={styles.savingLabel}>Sauvegarde…</span>}
        <button className={styles.navBtn} onClick={() => setStep(s => Math.min(STEPS.length, s + 1))} disabled={step === STEPS.length}>
          Suivant →
        </button>
      </div>
    </div>
  );
}
