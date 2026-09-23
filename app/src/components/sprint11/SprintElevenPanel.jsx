import { useState, useEffect, useCallback } from 'react';
import styles from './SprintElevenPanel.module.css';

const STEPS = [
  { id: 1, label: 'SOURCES' },
  { id: 2, label: 'DONNÉES' },
  { id: 3, label: 'SIGNAUX' },
  { id: 4, label: 'INCONNUES' },
  { id: 5, label: 'INTERPRÉTATION' },
  { id: 6, label: 'OPTIONS' },
  { id: 7, label: 'DÉCISION' },
  { id: 8, label: 'SYNTHÈSE' },
];

const VALID_DECISIONS = ['go', 'no_go', 'continue_tests'];

const DECISION_OPTIONS = [
  {
    value: 'go',
    title: 'GO — Continuer cette piste',
    desc: 'Les signaux terrain sont suffisamment cohérents pour aller de l\'avant.',
  },
  {
    value: 'no_go',
    title: 'NO-GO — Ne pas poursuivre dans cette forme',
    desc: 'Les données révèlent un problème structurel qui nécessite un changement majeur.',
  },
  {
    value: 'continue_tests',
    title: 'CONTINUER LES TESTS — Données insuffisantes',
    desc: 'Les signaux sont trop peu nombreux ou contradictoires pour trancher maintenant.',
  },
];

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

function SignalTag({ text, kind, onRemove, disabled }) {
  const cls = kind === 'recurring' ? styles.tagRecurring
    : kind === 'contradictory' ? styles.tagContradictory
    : styles.tagInsufficient;
  return (
    <span className={cls}>
      {text}
      {!disabled && (
        <button className={styles.tagRemove} onClick={onRemove} aria-label="Retirer">×</button>
      )}
    </span>
  );
}

export function SprintElevenPanel({ sprint, onMissionUpdate }) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState(null);
  const [sourceRefs, setSourceRefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  /* Signal tag inputs */
  const [newRecurring, setNewRecurring] = useState('');
  const [newContradictory, setNewContradictory] = useState('');
  const [newInsufficient, setNewInsufficient] = useState('');
  const [newUnknown, setNewUnknown] = useState('');
  const [newOption, setNewOption] = useState('');

  useEffect(() => {
    fetch('/api/s11/real-decision', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(body => {
        setSourceRefs(body.source_refs ?? null);
        const d = body.s11 ?? {};
        setData({
          observed_facts: d.observed_facts ?? '',
          signals: {
            recurring: d.signals?.recurring ?? [],
            contradictory: d.signals?.contradictory ?? [],
            insufficient: d.signals?.insufficient ?? [],
          },
          unknowns: d.unknowns ?? [],
          interpretation: d.interpretation ?? '',
          options_considered: d.options_considered ?? [],
          decision: VALID_DECISIONS.includes(d.decision) ? d.decision : null,
          justification: d.justification ?? '',
          next_action: d.next_action ?? '',
          epistemic_data_vs_interpretation: d.epistemic_data_vs_interpretation ?? false,
          epistemic_signal_not_rule: d.epistemic_signal_not_rule ?? false,
          epistemic_decision_without_certainty: d.epistemic_decision_without_certainty ?? false,
          status: d.status ?? 'draft',
        });
        if (d.status === 'submitted') setSubmitted(true);
      })
      .catch(() => setLoadError('Impossible de charger les données S11.'))
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async (patch) => {
    if (submitted) return;
    setSaving(true);
    try {
      await fetch('/api/s11/real-decision', {
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

  function updateSignals(kind, arr) {
    setData(d => ({ ...d, signals: { ...d.signals, [kind]: arr } }));
    save({ signals: { ...data.signals, [kind]: arr } });
  }

  function addSignal(kind, value, clearFn) {
    const v = value.trim();
    if (!v) return;
    const arr = [...(data.signals[kind] ?? []), v];
    clearFn('');
    updateSignals(kind, arr);
  }

  function removeSignal(kind, idx) {
    const arr = data.signals[kind].filter((_, i) => i !== idx);
    updateSignals(kind, arr);
  }

  function addUnknown(v) {
    const trimmed = v.trim();
    if (!trimmed) return;
    const arr = [...data.unknowns, trimmed];
    setNewUnknown('');
    setData(d => ({ ...d, unknowns: arr }));
    save({ unknowns: arr });
  }

  function removeUnknown(idx) {
    const arr = data.unknowns.filter((_, i) => i !== idx);
    setData(d => ({ ...d, unknowns: arr }));
    save({ unknowns: arr });
  }

  function addOption(v) {
    const trimmed = v.trim();
    if (!trimmed) return;
    const arr = [...data.options_considered, trimmed];
    setNewOption('');
    setData(d => ({ ...d, options_considered: arr }));
    save({ options_considered: arr });
  }

  function removeOption(idx) {
    const arr = data.options_considered.filter((_, i) => i !== idx);
    setData(d => ({ ...d, options_considered: arr }));
    save({ options_considered: arr });
  }

  async function handleSubmit() {
    setSubmitError(null);
    try {
      const r = await fetch('/api/s11/real-decision/submit', {
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
    if (s === 1) return !!(sourceRefs?.s8 || sourceRefs?.s9 || sourceRefs?.s10);
    if (s === 2) return !!(data.observed_facts?.trim());
    if (s === 3) return (data.signals.recurring.length + data.signals.contradictory.length + data.signals.insufficient.length) > 0;
    if (s === 4) return data.unknowns.length > 0;
    if (s === 5) return !!(data.interpretation?.trim());
    if (s === 6) return data.options_considered.length > 0;
    if (s === 7) return VALID_DECISIONS.includes(data.decision);
    if (s === 8) return !!(data.justification?.trim()) && !!(data.next_action?.trim()) && data.epistemic_data_vs_interpretation && data.epistemic_signal_not_rule && data.epistemic_decision_without_certainty;
    return false;
  }

  if (loading) return <p className={styles.loading}>Chargement…</p>;
  if (loadError) return <div className={styles.errorBox}>{loadError}</div>;
  if (!data) return null;

  const isSubmitted = submitted || data.status === 'submitted';

  if (isSubmitted) {
    return (
      <div className={styles.panel}>
        <div className={styles.successBox}>
          <span className={styles.successIcon}>✓</span>
          <span>Décision enregistrée — Sprint 11 soumis.</span>
        </div>
      </div>
    );
  }

  const s8 = sourceRefs?.s8;
  const s9 = sourceRefs?.s9;
  const s10 = sourceRefs?.s10;

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

        {/* STEP 1 — Sources */}
        {step === 1 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Tes données sources</h3>
            <p className={styles.sectionHint}>
              Ce que tu as collecté lors de tes sprints précédents. Ces données alimentent ta décision S11.
            </p>

            {s8 && (
              <div className={styles.sourceCard}>
                <div className={styles.sourceRow}>
                  <span className={styles.sourceLabel}>S8 — Test terrain</span>
                  <span className={styles.sourceValue}>{s8.firstTestOutcome ? `Résultat : ${s8.firstTestOutcome}` : ''}</span>
                </div>
                {s8.nextToVerify && (
                  <div className={styles.sourceRow}>
                    <span className={styles.sourceLabel}>Ce que tu voulais vérifier ensuite</span>
                    <span className={styles.sourceValue}>{s8.nextToVerify}</span>
                  </div>
                )}
              </div>
            )}

            {s9 && (
              <div className={styles.sourceCard}>
                <div className={styles.sourceRow}>
                  <span className={styles.sourceLabel}>S9 — Analyse terrain</span>
                  <span className={styles.sourceValue}>{s9.priorityHypothesis ?? <span className={styles.emptyNote}>Hypothèse non renseignée</span>}</span>
                </div>
                {s9.nextTestQuestion && (
                  <div className={styles.sourceRow}>
                    <span className={styles.sourceLabel}>Question à vérifier</span>
                    <span className={styles.sourceValue}>{s9.nextTestQuestion}</span>
                  </div>
                )}
              </div>
            )}

            {s10 && (
              <div className={styles.sourceCard}>
                <div className={styles.sourceRow}>
                  <span className={styles.sourceLabel}>S10 — Plan d'itération</span>
                  <span className={styles.sourceValue}>{s10.hypothesis ?? <span className={styles.emptyNote}>Hypothèse non renseignée</span>}</span>
                </div>
                {s10.variableUnderTest && (
                  <div className={styles.sourceRow}>
                    <span className={styles.sourceLabel}>Variable testée</span>
                    <span className={styles.sourceValue}>{s10.variableUnderTest}</span>
                  </div>
                )}
                {s10.completionCriterion && (
                  <div className={styles.sourceRow}>
                    <span className={styles.sourceLabel}>Critère de réalisation</span>
                    <span className={styles.sourceValue}>{s10.completionCriterion}</span>
                  </div>
                )}
              </div>
            )}

            {!s8 && !s9 && !s10 && (
              <p className={styles.emptyNote}>Aucune donnée source disponible depuis S8-S10.</p>
            )}

            <div className={styles.doctrineBox}>
              <strong>Rappel épistémique</strong>
              <p>DONNÉE ≠ SIGNAL ≠ INTERPRÉTATION ≠ DÉCISION.</p>
              <p className={styles.doctrineNote}>Ce que tu as observé concrètement (donnée) n'est pas encore une conclusion (interprétation).</p>
            </div>
          </div>
        )}

        {/* STEP 2 — Données */}
        {step === 2 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Ce que tu as observé</h3>
            <p className={styles.sectionHint}>
              Les faits bruts collectés sur le terrain. Ce que des personnes réelles ont dit ou fait. Pas encore d'interprétation.
            </p>
            <label className={styles.label}>
              Faits observés (données brutes)
              <textarea
                className={styles.textarea}
                rows={5}
                placeholder="Ex : 3 personnes sur 5 ont demandé le prix immédiatement. 1 personne a dit qu'elle n'avait pas de budget maintenant. 1 personne a acheté sans hésiter…"
                value={data.observed_facts}
                onChange={e => update({ observed_facts: e.target.value })}
                onBlur={e => save({ observed_facts: e.target.value })}
              />
            </label>
            <div className={styles.epNote}>
              Écris ce que les gens ont fait ou dit — pas ce que tu en penses encore.
            </div>
          </div>
        )}

        {/* STEP 3 — Signaux */}
        {step === 3 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Classification des signaux</h3>
            <p className={styles.sectionHint}>
              Un signal est une donnée qui se répète, contredit ou manque. Classe ici tes observations.
            </p>

            <div className={styles.signalGroup}>
              <span className={styles.signalGroupLabel}>Signaux récurrents (se répètent)</span>
              <div className={styles.tagsContainer}>
                {data.signals.recurring.map((t, i) => (
                  <SignalTag key={i} text={t} kind="recurring" onRemove={() => removeSignal('recurring', i)} />
                ))}
              </div>
              <div className={styles.tagInput}>
                <input
                  className={styles.input}
                  placeholder="Ex : Les personnes demandent toujours le prix en premier…"
                  value={newRecurring}
                  onChange={e => setNewRecurring(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSignal('recurring', newRecurring, setNewRecurring)}
                />
                <button className={styles.addBtn} onClick={() => addSignal('recurring', newRecurring, setNewRecurring)}>+</button>
              </div>
            </div>

            <div className={styles.signalGroup}>
              <span className={styles.signalGroupLabel}>Signaux contradictoires (s'opposent)</span>
              <div className={styles.tagsContainer}>
                {data.signals.contradictory.map((t, i) => (
                  <SignalTag key={i} text={t} kind="contradictory" onRemove={() => removeSignal('contradictory', i)} />
                ))}
              </div>
              <div className={styles.tagInput}>
                <input
                  className={styles.input}
                  placeholder="Ex : Certaines personnes achètent, d'autres refusent pour la même raison…"
                  value={newContradictory}
                  onChange={e => setNewContradictory(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSignal('contradictory', newContradictory, setNewContradictory)}
                />
                <button className={styles.addBtn} onClick={() => addSignal('contradictory', newContradictory, setNewContradictory)}>+</button>
              </div>
            </div>

            <div className={styles.signalGroup}>
              <span className={styles.signalGroupLabel}>Signaux insuffisants (trop peu de données)</span>
              <div className={styles.tagsContainer}>
                {data.signals.insufficient.map((t, i) => (
                  <SignalTag key={i} text={t} kind="insufficient" onRemove={() => removeSignal('insufficient', i)} />
                ))}
              </div>
              <div className={styles.tagInput}>
                <input
                  className={styles.input}
                  placeholder="Ex : Seulement 1 personne testée sur ce segment…"
                  value={newInsufficient}
                  onChange={e => setNewInsufficient(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addSignal('insufficient', newInsufficient, setNewInsufficient)}
                />
                <button className={styles.addBtn} onClick={() => addSignal('insufficient', newInsufficient, setNewInsufficient)}>+</button>
              </div>
            </div>

            <div className={styles.epNote}>
              SIGNAL RÉCURRENT ≠ RÈGLE GÉNÉRALE. Une répétition sur 3 tests n'est pas une loi.
            </div>
          </div>
        )}

        {/* STEP 4 — Inconnues */}
        {step === 4 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Ce que tu ne sais pas encore</h3>
            <p className={styles.sectionHint}>
              Les questions restées sans réponse après tes tests. Les inconnues conscientes font partie d'une bonne décision.
            </p>
            <div className={styles.tagsContainer}>
              {data.unknowns.map((t, i) => (
                <SignalTag key={i} text={t} kind="insufficient" onRemove={() => removeUnknown(i)} />
              ))}
            </div>
            <div className={styles.tagInput}>
              <input
                className={styles.input}
                placeholder="Ex : Je ne sais pas encore si ce prix est acceptable pour les entreprises…"
                value={newUnknown}
                onChange={e => setNewUnknown(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addUnknown(newUnknown)}
              />
              <button className={styles.addBtn} onClick={() => addUnknown(newUnknown)}>+</button>
            </div>
            <div className={styles.epNote}>
              Nommer ce qu'on ne sait pas est une compétence stratégique, pas un aveu de faiblesse.
            </div>
          </div>
        )}

        {/* STEP 5 — Interprétation */}
        {step === 5 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Ton interprétation</h3>
            <p className={styles.sectionHint}>
              Ce que les données te disent, selon toi. C'est une lecture — pas encore une décision.
            </p>
            <label className={styles.label}>
              Comment tu interprètes ces signaux
              <textarea
                className={styles.textarea}
                rows={5}
                placeholder="Ex : Les signaux récurrents suggèrent que la cible est bien identifiée mais que le prix crée une friction. Je pense que l'offre est comprise mais pas encore perçue comme prioritaire…"
                value={data.interpretation}
                onChange={e => update({ interpretation: e.target.value })}
                onBlur={e => save({ interpretation: e.target.value })}
              />
            </label>
            <div className={styles.epNote}>
              Une interprétation honnête reconnaît aussi ce qui contredit ta lecture préférée.
            </div>
          </div>
        )}

        {/* STEP 6 — Options */}
        {step === 6 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Les options que tu as pesées</h3>
            <p className={styles.sectionHint}>
              Avant de décider, quelles directions étaient possibles ? Note les options que tu as réellement envisagées.
            </p>
            <div className={styles.tagsContainer}>
              {data.options_considered.map((t, i) => (
                <SignalTag key={i} text={t} kind="insufficient" onRemove={() => removeOption(i)} />
              ))}
            </div>
            <div className={styles.tagInput}>
              <input
                className={styles.input}
                placeholder="Ex : Baisser le prix de 30 % / Changer la cible / Arrêter ce produit et tester un autre…"
                value={newOption}
                onChange={e => setNewOption(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addOption(newOption)}
              />
              <button className={styles.addBtn} onClick={() => addOption(newOption)}>+</button>
            </div>
          </div>
        )}

        {/* STEP 7 — Décision */}
        {step === 7 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Ta décision</h3>
            <p className={styles.sectionHint}>
              Une décision fondée sur les données terrain que tu as collectées.
            </p>
            <div className={styles.decisionOptions}>
              {DECISION_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`${styles.decisionOption} ${data.decision === opt.value ? styles.decisionOptionSelected : ''}`}
                  onClick={() => {
                    update({ decision: opt.value });
                    save({ decision: opt.value });
                  }}
                >
                  <span className={styles.decisionOptionTitle}>{opt.title}</span>
                  <span className={styles.decisionOptionDesc}>{opt.desc}</span>
                </button>
              ))}
            </div>
            <div className={styles.epNote}>
              GO ≠ GARANTIE DE SUCCÈS. NO-GO ≠ ÉCHEC DÉFINITIF. Continuer les tests est une décision stratégique légitime.
            </div>
          </div>
        )}

        {/* STEP 8 — Synthèse */}
        {step === 8 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Justification &amp; suite</h3>
            <p className={styles.sectionHint}>
              Documente le raisonnement qui t'a menée à cette décision et la prochaine action concrète.
            </p>
            <label className={styles.label}>
              Justification de la décision
              <textarea
                className={styles.textarea}
                rows={4}
                placeholder="Explique pourquoi ces données t'amènent à cette décision et pas une autre…"
                value={data.justification}
                onChange={e => update({ justification: e.target.value })}
                onBlur={e => save({ justification: e.target.value })}
              />
            </label>
            <label className={styles.label}>
              Prochaine action concrète
              <textarea
                className={styles.textarea}
                rows={3}
                placeholder="La première chose que tu fais demain suite à cette décision…"
                value={data.next_action}
                onChange={e => update({ next_action: e.target.value })}
                onBlur={e => save({ next_action: e.target.value })}
              />
            </label>

            <AcknowledgeField
              label="Donnée ≠ Interprétation"
              hint="J'ai distingué les faits bruts observés de ma lecture de ces faits."
              value={data.epistemic_data_vs_interpretation}
              onChange={v => { update({ epistemic_data_vs_interpretation: v }); save({ epistemic_data_vs_interpretation: v }); }}
            />
            <AcknowledgeField
              label="Signal récurrent ≠ Règle générale"
              hint="Je n'ai pas généralisé un signal répété en loi universelle."
              value={data.epistemic_signal_not_rule}
              onChange={v => { update({ epistemic_signal_not_rule: v }); save({ epistemic_signal_not_rule: v }); }}
            />
            <AcknowledgeField
              label="Décider sans certitude"
              hint="Ma décision est fondée sur les données disponibles, pas sur la certitude du résultat."
              value={data.epistemic_decision_without_certainty}
              onChange={v => { update({ epistemic_decision_without_certainty: v }); save({ epistemic_decision_without_certainty: v }); }}
            />

            <div className={styles.submitArea}>
              <button
                className={styles.submitBtn}
                onClick={handleSubmit}
                disabled={!VALID_DECISIONS.includes(data.decision) || !data.justification?.trim() || !data.next_action?.trim() || !data.epistemic_data_vs_interpretation || !data.epistemic_signal_not_rule || !data.epistemic_decision_without_certainty}
              >
                Soumettre ma décision →
              </button>
              <p className={styles.submitNote}>
                Une décision stratégique Go/No-Go sera enregistrée. Tu ne peux pas invalider ou supprimer une décision passée.
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
