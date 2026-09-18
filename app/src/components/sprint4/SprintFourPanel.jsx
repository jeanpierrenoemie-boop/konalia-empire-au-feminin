/**
 * SprintFourPanel — S4 : VERROUILLE TA DIRECTION
 * Three steps: Contrat de Direction | Faits & Hypothèses | Verrouillage
 */
import { useState, useEffect, useCallback } from 'react';
import styles from './SprintFourPanel.module.css';

const REOPENING_FIELDS = [
  {
    key: 'hypothesis_contradiction',
    label: 'Hypothèse centrale contredite',
    question: 'Quelle information contredirait l\'hypothèse principale de ta Direction ? (ex : 80% des personnes interrogées nient ce problème)',
  },
  {
    key: 'major_constraint',
    label: 'Contrainte majeure',
    question: 'Quelle contrainte imprévue rendrait cette Direction non testable ? (ex : loi, accès impossible)',
  },
  {
    key: 'new_information',
    label: 'Information nouvelle significative',
    question: 'Quelle information changerait fondamentalement ta lecture du problème ? (ex : concurrent dominant, évolution réglementaire)',
  },
];

/* ── AcknowledgeField — text area + optional ack button ─────────── */
function AcknowledgeField({ label, question, value, acknowledged, onValue, onAck, onUnack, disabled }) {
  const treated = !!value?.trim() || acknowledged;
  return (
    <div className={`${styles.ackField} ${treated ? styles.ackFieldTreated : ''}`}>
      <div className={styles.ackFieldHeader}>
        <span className={styles.ackFieldLabel}>{label}</span>
        {treated && <span className={styles.ackCheck}>✓</span>}
      </div>
      <p className={styles.ackQuestion}>{question}</p>
      {!acknowledged ? (
        <>
          <textarea
            className={styles.ackTextarea}
            rows={3}
            placeholder="Décris cette condition précisément…"
            value={value ?? ''}
            onChange={e => onValue(e.target.value)}
            disabled={disabled}
          />
          {!value?.trim() && !disabled && (
            <button className={styles.ackBtn} type="button" onClick={onAck}>
              Non applicable pour ma Direction
            </button>
          )}
        </>
      ) : (
        <div className={styles.ackAcknowledged}>
          <span>Non applicable pour cette Direction.</span>
          {!disabled && (
            <button className={styles.ackUndoBtn} type="button" onClick={onUnack}>Modifier</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */
export function SprintFourPanel({ sprint, onMissionUpdate }) {
  const [step, setStep] = useState(0); // 0: Contrat | 1: Faits & Hypothèses | 2: Verrouillage

  const [s4, setS4] = useState(null);
  const [priorityPath, setPriorityPath] = useState(null);
  const [setAsidePaths, setSetAsidePaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState(null);
  const [lockError, setLockError] = useState(null);

  // Form fields
  const [formulation, setFormulation] = useState('');
  const [person, setPerson] = useState('');
  const [problem, setProblem] = useState('');
  const [whyForTest, setWhyForTest] = useState('');
  const [facts, setFacts] = useState('');
  const [factsAcknowledged, setFactsAcknowledged] = useState(false);
  const [hypotheses, setHypotheses] = useState('');
  const [hypothesesAcknowledged, setHypothesesAcknowledged] = useState(false);
  const [toVerify, setToVerify] = useState('');
  const [acceptedUnknown, setAcceptedUnknown] = useState('');
  const [reopening, setReopening] = useState({
    hypothesis_contradiction: '',
    major_constraint: '',
    new_information: '',
    acknowledged: { hypothesis_contradiction: false, major_constraint: false, new_information: false },
  });
  const [confirmed, setConfirmed] = useState(false);

  const locked = s4?.status === 'locked';

  const loadState = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/s4/direction', { credentials: 'include' });
      if (!r.ok) throw new Error('Erreur de chargement');
      const body = await r.json();
      setPriorityPath(body.priority_path);
      setSetAsidePaths(body.set_aside_paths ?? []);
      if (body.s4) {
        const d = body.s4;
        setS4(d);
        setFormulation(d.direction?.formulation ?? '');
        setPerson(d.direction?.person ?? body.priority_path?.person ?? '');
        setProblem(d.direction?.problem ?? body.priority_path?.problem ?? '');
        setWhyForTest(d.why_for_test ?? '');
        setFacts(d.facts ?? '');
        setFactsAcknowledged(d.facts_acknowledged ?? false);
        setHypotheses(d.hypotheses ?? '');
        setHypothesesAcknowledged(d.hypotheses_acknowledged ?? false);
        setToVerify(d.to_verify ?? '');
        setAcceptedUnknown(d.accepted_unknown ?? '');
        setReopening(d.reopening_conditions ?? {
          hypothesis_contradiction: '',
          major_constraint: '',
          new_information: '',
          acknowledged: { hypothesis_contradiction: false, major_constraint: false, new_information: false },
        });
        setConfirmed(d.participant_confirmed ?? false);
      } else if (body.priority_path) {
        // Prefill from S3
        setPerson(body.priority_path.person ?? '');
        setProblem(body.priority_path.problem ?? '');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadState(); }, [loadState]);

  async function saveDraft() {
    if (locked) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/s4/direction', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: { formulation, person, problem },
          why_for_test: whyForTest,
          facts, facts_acknowledged: factsAcknowledged,
          hypotheses, hypotheses_acknowledged: hypothesesAcknowledged,
          to_verify: toVerify,
          accepted_unknown: acceptedUnknown,
          reopening_conditions: reopening,
          participant_confirmed: confirmed,
        }),
      });
      const body = await r.json();
      if (!r.ok) { setError(body.error ?? 'Erreur lors de la sauvegarde'); return; }
      setS4(body.s4);
    } catch {
      setError('Erreur réseau');
    } finally {
      setSaving(false);
    }
  }

  async function lock() {
    setLockError(null);
    setLocking(true);
    try {
      await saveDraft();
      const r = await fetch('/api/s4/direction/lock', {
        method: 'POST',
        credentials: 'include',
      });
      const body = await r.json();
      if (!r.ok) { setLockError(body.error ?? 'Erreur lors du verrouillage'); return; }
      await loadState();
      if (onMissionUpdate) onMissionUpdate();
    } catch {
      setLockError('Erreur réseau');
    } finally {
      setLocking(false);
    }
  }

  function updateReopening(key, value) {
    setReopening(rc => ({ ...rc, [key]: value }));
  }
  function ackReopening(key) {
    setReopening(rc => ({ ...rc, acknowledged: { ...rc.acknowledged, [key]: true } }));
  }
  function unackReopening(key) {
    setReopening(rc => ({ ...rc, acknowledged: { ...rc.acknowledged, [key]: false } }));
  }

  // Completeness check mirrors backend
  const step0Complete = formulation.trim() && person.trim() && problem.trim() && whyForTest.trim();
  const step1Complete =
    (facts.trim() || factsAcknowledged) &&
    (hypotheses.trim() || hypothesesAcknowledged) &&
    toVerify.trim() &&
    acceptedUnknown.trim();
  const reopeningComplete = REOPENING_FIELDS.every(
    f => reopening[f.key]?.trim() || reopening.acknowledged?.[f.key]
  );
  const canLock = step0Complete && step1Complete && reopeningComplete && confirmed;

  if (loading) return <div className={styles.loading}>Chargement…</div>;

  if (locked) {
    return (
      <div className={styles.lockedState}>
        <div className={styles.lockedHeader}>
          <span className={styles.lockedIcon}>✓</span>
          <h3 className={styles.lockedTitle}>DIRECTION VERROUILLÉE POUR TEST</h3>
        </div>
        <div className={styles.lockedCard}>
          <p className={styles.lockedFormulation}>{formulation}</p>
          <div className={styles.lockedMeta}>
            <span className={styles.lockedMetaLabel}>POUR QUI</span>
            <span>{person}</span>
          </div>
          <div className={styles.lockedMeta}>
            <span className={styles.lockedMetaLabel}>PROBLÈME EXPLORÉ</span>
            <span>{problem}</span>
          </div>
        </div>
        {toVerify && (
          <div className={styles.lockedSection}>
            <span className={styles.lockedSectionLabel}>CE QUE JE DOIS VÉRIFIER</span>
            <p>{toVerify}</p>
          </div>
        )}
        {acceptedUnknown && (
          <div className={styles.lockedSection}>
            <span className={styles.lockedSectionLabel}>CE QUE J'ACCEPTE DE NE PAS ENCORE SAVOIR</span>
            <p>{acceptedUnknown}</p>
          </div>
        )}
        <div className={styles.lockedFooter}>
          <span className={styles.lockBadge}>Direction officielle — Sprint 4</span>
        </div>
      </div>
    );
  }

  const STEPS = ['1 · Contrat de Direction', '2 · Faits & Hypothèses', '3 · Verrouillage'];

  return (
    <div className={styles.panel}>
      <div className={styles.stepNav}>
        {STEPS.map((label, i) => (
          <button
            key={i}
            className={`${styles.stepBtn} ${step === i ? styles.stepActive : ''} ${i === 0 && step0Complete ? styles.stepDone : ''} ${i === 1 && step1Complete ? styles.stepDone : ''}`}
            onClick={() => setStep(i)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}

      {/* Step 0: Contrat de Direction */}
      {step === 0 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>MON CONTRAT DE DIRECTION</h3>
            <p className={styles.sectionIntro}>
              Ta Direction n'est pas un choix définitif. C'est un engagement à tester une direction spécifique —
              pour une personne précise, autour d'un problème précis — avant de décider de continuer ou de pivoter.
            </p>
          </div>

          {priorityPath && (
            <div className={styles.prefillBanner}>
              <span className={styles.prefillLabel}>Piste prioritaire S3</span>
              <span className={styles.prefillValue}>{priorityPath.name}</span>
            </div>
          )}

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>MA DIRECTION — CE QUE JE VAIS TESTER</label>
            <p className={styles.fieldHint}>
              Formule une phrase claire : "Je vais tester si [personne] serait prête à [action] pour [problème]."
            </p>
            <textarea
              className={styles.textarea}
              rows={4}
              placeholder="Je vais tester si…"
              value={formulation}
              onChange={e => setFormulation(e.target.value)}
              onBlur={saveDraft}
              disabled={locked}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>POUR QUI ?</label>
            <p className={styles.fieldHint}>La personne au cœur de ta Direction. Sois précise.</p>
            <input
              className={styles.input}
              type="text"
              placeholder="ex : Managers de PME (20-200 personnes)"
              value={person}
              onChange={e => setPerson(e.target.value)}
              onBlur={saveDraft}
              disabled={locked}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>AUTOUR DE QUEL PROBLÈME ?</label>
            <p className={styles.fieldHint}>Le problème que cette Direction cherche à explorer et comprendre.</p>
            <input
              className={styles.input}
              type="text"
              placeholder="ex : Difficulté à recruter et fidéliser des talents"
              value={problem}
              onChange={e => setProblem(e.target.value)}
              onBlur={saveDraft}
              disabled={locked}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>POURQUOI CETTE DIRECTION MÉRITE-T-ELLE D'ÊTRE TESTÉE ?</label>
            <p className={styles.fieldHint}>
              Ce n'est pas une validation marché. C'est ta raison personnelle de commencer par là.
            </p>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="Parce que…"
              value={whyForTest}
              onChange={e => setWhyForTest(e.target.value)}
              onBlur={saveDraft}
              disabled={locked}
            />
          </div>

          {setAsidePaths.length > 0 && (
            <div className={styles.setAside}>
              <span className={styles.setAsideLabel}>PISTES MISES DE CÔTÉ (non abandonnées)</span>
              <ul className={styles.setAsideList}>
                {setAsidePaths.map(p => (
                  <li key={p.id} className={styles.setAsideItem}>{p.name}</li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.stepNav2}>
            <button
              className={`${styles.nextBtn} ${step0Complete ? '' : styles.nextBtnDisabled}`}
              onClick={() => { saveDraft(); setStep(1); }}
              disabled={!step0Complete || saving}
              type="button"
            >
              Continuer → Faits & Hypothèses
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Faits & Hypothèses */}
      {step === 1 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>CE SUR QUOI REPOSE MA DIRECTION</h3>
            <p className={styles.sectionIntro}>
              Distingue ce que tu sais réellement (faits vérifiés) de ce que tu supposes (hypothèses).
              Cette distinction protège ta Direction contre l'auto-illusion.
            </p>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>CE QUE JE SAIS — faits vérifiés</label>
            <p className={styles.fieldHint}>Expériences concrètes, données réelles, observations directes.</p>
            {!factsAcknowledged ? (
              <>
                <textarea
                  className={styles.textarea}
                  rows={3}
                  placeholder="ex : J'ai formé 50 managers. 3 m'ont mentionné ce problème."
                  value={facts}
                  onChange={e => setFacts(e.target.value)}
                  onBlur={saveDraft}
                  disabled={locked}
                />
                {!facts.trim() && !locked && (
                  <button className={styles.ackBtn} type="button" onClick={() => setFactsAcknowledged(true)}>
                    Je n'ai pas de faits supplémentaires à ajouter
                  </button>
                )}
              </>
            ) : (
              <div className={styles.ackAcknowledged}>
                <span>Aucun fait supplémentaire à ajouter.</span>
                <button className={styles.ackUndoBtn} type="button" onClick={() => setFactsAcknowledged(false)}>Modifier</button>
              </div>
            )}
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>CE QUE JE SUPPOSE — hypothèses</label>
            <p className={styles.fieldHint}>Ce que tu crois vrai mais n'as pas encore vérifié directement.</p>
            {!hypothesesAcknowledged ? (
              <>
                <textarea
                  className={styles.textarea}
                  rows={3}
                  placeholder="ex : Ces managers seraient prêts à payer pour une solution externe."
                  value={hypotheses}
                  onChange={e => setHypotheses(e.target.value)}
                  onBlur={saveDraft}
                  disabled={locked}
                />
                {!hypotheses.trim() && !locked && (
                  <button className={styles.ackBtn} type="button" onClick={() => setHypothesesAcknowledged(true)}>
                    Je n'ai pas d'hypothèses supplémentaires à ajouter
                  </button>
                )}
              </>
            ) : (
              <div className={styles.ackAcknowledged}>
                <span>Aucune hypothèse supplémentaire à ajouter.</span>
                <button className={styles.ackUndoBtn} type="button" onClick={() => setHypothesesAcknowledged(false)}>Modifier</button>
              </div>
            )}
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>CE QUE JE DOIS VÉRIFIER EN PRIORITÉ</label>
            <p className={styles.fieldHint}>L'inconnue qui, si elle était résolue, changerait le plus ta décision.</p>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="ex : Si les décideurs alloueraient un budget formation à ce problème."
              value={toVerify}
              onChange={e => setToVerify(e.target.value)}
              onBlur={saveDraft}
              disabled={locked}
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>CE QUE J'ACCEPTE DE NE PAS ENCORE SAVOIR</label>
            <p className={styles.fieldHint}>
              Reconnaître l'inconnu que tu acceptes provisoirement pour avancer.
              Ce n'est pas de la résignation — c'est de la lucidité.
            </p>
            <textarea
              className={styles.textarea}
              rows={3}
              placeholder="ex : Je ne sais pas encore si la taille du marché est suffisante."
              value={acceptedUnknown}
              onChange={e => setAcceptedUnknown(e.target.value)}
              onBlur={saveDraft}
              disabled={locked}
            />
          </div>

          <div className={styles.stepNav2}>
            <button className={styles.backBtn} onClick={() => setStep(0)} type="button">← Retour</button>
            <button
              className={`${styles.nextBtn} ${step1Complete ? '' : styles.nextBtnDisabled}`}
              onClick={() => { saveDraft(); setStep(2); }}
              disabled={!step1Complete || saving}
              type="button"
            >
              Continuer → Verrouillage
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Verrouillage */}
      {step === 2 && (
        <div className={styles.stepBody}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>CONDITIONS DE RÉOUVERTURE</h3>
            <p className={styles.sectionIntro}>
              Avant de verrouiller, définis à l'avance les seules conditions qui justifieraient de rouvrir cette Direction.
              C'est ce qui protège ton engagement contre les remises en question émotionnelles.
            </p>
          </div>

          {REOPENING_FIELDS.map(f => (
            <AcknowledgeField
              key={f.key}
              label={f.label}
              question={f.question}
              value={reopening[f.key] ?? ''}
              acknowledged={reopening.acknowledged?.[f.key] ?? false}
              onValue={v => updateReopening(f.key, v)}
              onAck={() => ackReopening(f.key)}
              onUnack={() => unackReopening(f.key)}
              disabled={locked}
            />
          ))}

          <div className={styles.summaryBlock}>
            <h4 className={styles.summaryTitle}>RÉSUMÉ DE TA DIRECTION</h4>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Direction</span>
              <span className={styles.summaryValue}>{formulation || '—'}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Pour qui</span>
              <span className={styles.summaryValue}>{person || '—'}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Problème</span>
              <span className={styles.summaryValue}>{problem || '—'}</span>
            </div>
          </div>

          <div className={styles.confirmBlock}>
            <label className={styles.confirmLabel}>
              <input
                type="checkbox"
                className={styles.confirmCheckbox}
                checked={confirmed}
                onChange={e => { setConfirmed(e.target.checked); }}
                disabled={locked}
              />
              <span>
                Je confirme que cette Direction est celle que je vais tester.
                Je comprends qu'elle peut être rouverte uniquement dans les conditions que j'ai définies ci-dessus.
              </span>
            </label>
          </div>

          {lockError && <p className={styles.errorMsg}>{lockError}</p>}

          <div className={styles.stepNav2}>
            <button className={styles.backBtn} onClick={() => setStep(1)} type="button">← Retour</button>
            <button
              className={`${styles.lockBtn} ${canLock ? '' : styles.lockBtnDisabled}`}
              onClick={lock}
              disabled={!canLock || locking}
              type="button"
            >
              {locking ? 'Verrouillage…' : 'Verrouiller ma Direction →'}
            </button>
          </div>

          {!canLock && (
            <p className={styles.lockHint}>
              {!step0Complete && 'Complète ton Contrat de Direction (étape 1).'}
              {step0Complete && !step1Complete && 'Complète la section Faits & Hypothèses (étape 2).'}
              {step0Complete && step1Complete && !reopeningComplete && 'Définis ou confirme tes conditions de réouverture.'}
              {step0Complete && step1Complete && reopeningComplete && !confirmed && 'Coche la confirmation ci-dessus pour continuer.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
