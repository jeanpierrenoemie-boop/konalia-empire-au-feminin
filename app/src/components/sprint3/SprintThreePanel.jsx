/**
 * SprintThreePanel — S3 : LE CHOIX QUI LIBÈRE
 * Three modes: Vidéo | Audio | Passer à l'action
 * Action mode: Matrice d'Arbitrage → Piste Prioritaire
 */
import { useState, useEffect, useCallback } from 'react';
import styles from './SprintThreePanel.module.css';

const CRITERIA = [
  {
    key: 'envie_reelle',
    label: 'Envie réelle',
    question: 'Est-ce que j\'ai réellement envie d\'explorer cette piste, au-delà de son apparence séduisante ?',
  },
  {
    key: 'ressources_existantes',
    label: 'Ressources existantes',
    question: 'Est-ce que je possède déjà des compétences, expériences, connaissances ou accès utiles pour commencer ?',
  },
  {
    key: 'acces_personnes',
    label: 'Accès aux personnes',
    question: 'Puis-je identifier et atteindre des personnes correspondant à cette piste pour apprendre du terrain ?',
  },
  {
    key: 'probleme_a_explorer',
    label: 'Problème à explorer',
    question: 'Le problème est-il suffisamment concret pour pouvoir être investigué avec de vraies personnes ?',
  },
  {
    key: 'compatibilite_vie',
    label: 'Compatibilité avec ma vie',
    question: 'Puis-je commencer à tester cette piste avec mon temps, mes contraintes et ma situation actuelle ?',
  },
  {
    key: 'simplicite_premier_test',
    label: 'Simplicité du premier test',
    question: 'Puis-je imaginer une première manière simple de confronter cette piste au réel sans construire tout un business ?',
  },
  {
    key: 'niveau_inconnu',
    label: "Niveau d'inconnu",
    question: 'Quelles hypothèses centrales restent encore à vérifier avant de pouvoir être plus confiante ?',
    invertedNote: true, // high unknown = more caution needed
  },
];

const RATINGS = ['FORT', 'MOYEN', 'FAIBLE'];
const RATING_LABELS = { FORT: 'Fort', MOYEN: 'Moyen / À vérifier', FAIBLE: 'Faible' };

/* ── Media placeholder ─────────────────────────────────────────── */
function MediaPlaceholder({ type, url }) {
  if (url) {
    return (
      <div className={styles.mediaContainer}>
        {type === 'video'
          ? <video controls src={url} className={styles.video} />
          : <audio controls src={url} className={styles.audio} />
        }
      </div>
    );
  }
  return (
    <div className={styles.mediaPlaceholder}>
      <div className={styles.placeholderIcon}>{type === 'video' ? '▶' : '♪'}</div>
      <p className={styles.placeholderTitle}>À PRODUIRE</p>
      <p className={styles.placeholderText}>Tu peux apprendre en mouvement.<br />Tu reviens dans le programme pour décider et agir.</p>
    </div>
  );
}

/* ── S2 path recap card ─────────────────────────────────────────── */
function S2PathCard({ path, isSelected, onSelect, selectionMode }) {
  return (
    <div
      className={`${styles.s2Card} ${isSelected ? styles.s2CardSelected : ''}`}
      onClick={selectionMode ? () => onSelect(path.id) : undefined}
      style={selectionMode ? { cursor: 'pointer' } : {}}
    >
      <div className={styles.s2CardHeader}>
        {selectionMode && (
          <span className={`${styles.selectCircle} ${isSelected ? styles.selectCircleActive : ''}`} aria-hidden />
        )}
        <span className={styles.s2CardName}>{path.name || path.starting_resource}</span>
      </div>
      <div className={styles.s2CardChain}>
        <span><strong>Ressource :</strong> {path.starting_resource}</span>
        <span><strong>Personne :</strong> {path.person}</span>
        <span><strong>Problème :</strong> {path.problem}</span>
      </div>
      {path.what_i_know && <p className={styles.s2CardDetail}><strong>Je sais :</strong> {path.what_i_know}</p>}
      {path.what_i_assume && <p className={styles.s2CardDetail}><strong>Je suppose :</strong> {path.what_i_assume}</p>}
      {path.what_i_need_to_verify && <p className={styles.s2CardDetail}><strong>À vérifier :</strong> {path.what_i_need_to_verify}</p>}
    </div>
  );
}

/* ── Matrix row for one path ────────────────────────────────────── */
function MatrixRow({ path, row, onChange }) {
  function updateCriterion(key, field, value) {
    const updated = {
      ...row,
      criteria: {
        ...row.criteria,
        [key]: { ...((row.criteria ?? {})[key] ?? {}), [field]: value },
      },
    };
    onChange(updated);
  }

  const criteria = row.criteria ?? {};
  const allRated = CRITERIA.every(c => RATINGS.includes(criteria[c.key]?.rating));

  return (
    <div className={`${styles.matrixRow} ${allRated ? styles.matrixRowComplete : ''}`}>
      <div className={styles.matrixPathHeader}>
        <span className={styles.matrixPathName}>{path?.name || path?.starting_resource || row.path_id}</span>
        {allRated && <span className={styles.matrixCheck}>✓</span>}
      </div>
      <div className={styles.criteriaGrid}>
        {CRITERIA.map(crit => {
          const c = criteria[crit.key] ?? {};
          return (
            <div key={crit.key} className={styles.criterionBlock}>
              <div className={styles.criterionHeader}>
                <span className={styles.criterionLabel}>{crit.label}</span>
                {crit.invertedNote && (
                  <span className={styles.criterionHint}>↑ haut = plus d'inconnues</span>
                )}
              </div>
              <p className={styles.criterionQuestion}>{crit.question}</p>
              <div className={styles.ratingButtons}>
                {RATINGS.map(r => (
                  <button
                    key={r}
                    type="button"
                    className={`${styles.ratingBtn} ${c.rating === r ? styles[`ratingBtn_${r}`] : ''}`}
                    onClick={() => updateCriterion(crit.key, 'rating', r)}
                  >
                    {RATING_LABELS[r]}
                  </button>
                ))}
              </div>
              <textarea
                className={styles.criterionNote}
                value={c.note ?? ''}
                onChange={e => updateCriterion(crit.key, 'note', e.target.value)}
                placeholder="Note facultative…"
                rows={2}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Missing info block ─────────────────────────────────────────── */
function MissingInfoBlock({ value, onChange }) {
  const [open, setOpen] = useState(!!value?.needed);

  if (!open) {
    return (
      <div className={styles.missingInfoOffer}>
        <button className={styles.missingInfoToggle} type="button" onClick={() => setOpen(true)}>
          J&apos;ai besoin d&apos;une information avant de trancher
        </button>
        <p className={styles.missingInfoHint}>
          Tu ne cherches pas à supprimer toute incertitude. Tu cherches l&apos;information qui peut réellement changer ta décision.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.missingInfoBlock}>
      <div className={styles.missingInfoTitle}>J&apos;AI BESOIN D&apos;UNE INFORMATION AVANT DE TRANCHER</div>
      <p className={styles.missingInfoHint}>
        Tu ne cherches pas à supprimer toute incertitude. Tu cherches l&apos;information qui peut réellement changer ta décision.
      </p>
      <label className={styles.fieldLabel}>Quelle information manque-t-il ?</label>
      <textarea
        className={styles.fieldTextarea}
        value={value?.needed ?? ''}
        onChange={e => onChange({ ...(value ?? {}), needed: e.target.value })}
        placeholder="L'information manquante…"
        rows={2}
      />
      <label className={styles.fieldLabel}>Pourquoi ça change ta décision ?</label>
      <textarea
        className={styles.fieldTextarea}
        value={value?.why_it_matters ?? ''}
        onChange={e => onChange({ ...(value ?? {}), why_it_matters: e.target.value })}
        placeholder="Ce que ça changerait si tu le savais…"
        rows={2}
      />
      <label className={styles.fieldLabel}>La plus petite façon de l&apos;obtenir ?</label>
      <textarea
        className={styles.fieldTextarea}
        value={value?.smallest_way_to_get_it ?? ''}
        onChange={e => onChange({ ...(value ?? {}), smallest_way_to_get_it: e.target.value })}
        placeholder="Une action concrète et minimale…"
        rows={2}
      />
      <button className={styles.missingInfoCancel} type="button" onClick={() => { setOpen(false); onChange(null); }}>
        Annuler
      </button>
    </div>
  );
}

/* ── Synthesis view ─────────────────────────────────────────────── */
function ArbitrationSummary({ snapshotPaths, matrix, decisionBasis, priorityPathId, whyPriority, remainingToVerify, acceptedUnknown }) {
  const priorityPath = snapshotPaths?.find(p => p.id === priorityPathId);
  const priorityMatrix = matrix?.find(m => m.path_id === priorityPathId);

  return (
    <div className={styles.summary}>
      <h3 className={styles.summaryTitle}>MA MATRICE D&apos;ARBITRAGE</h3>
      {(snapshotPaths ?? []).map(path => {
        const row = matrix?.find(m => m.path_id === path.id);
        return (
          <div key={path.id} className={`${styles.summaryPath} ${path.id === priorityPathId ? styles.summaryPathPriority : ''}`}>
            <div className={styles.summaryPathHeader}>
              <span className={styles.summaryPathName}>{path.name || path.starting_resource}</span>
              {path.id === priorityPathId && <span className={styles.priorityBadge}>★ PRIORITAIRE</span>}
            </div>
            {row && (
              <div className={styles.summaryGrid}>
                {CRITERIA.map(crit => {
                  const c = row.criteria?.[crit.key];
                  return (
                    <div key={crit.key} className={styles.summaryCriterion}>
                      <span className={styles.summaryCritLabel}>{crit.label}</span>
                      <span className={`${styles.summaryCritRating} ${c?.rating ? styles[`rating_${c.rating}`] : ''}`}>
                        {c?.rating ? RATING_LABELS[c.rating] : '—'}
                      </span>
                      {c?.note && <span className={styles.summaryCritNote}>{c.note}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {decisionBasis && (
        <div className={styles.summaryBasis}>
          <h3 className={styles.summaryBasisTitle}>SUR QUOI REPOSE MON CHOIX ?</h3>
          {BASIS_FIELDS.map(f => {
            const val = decisionBasis[f.key];
            const ack = decisionBasis.acknowledged?.[f.key];
            if (!val?.trim() && !ack) return null;
            return (
              <div key={f.key} className={styles.summaryBasisField}>
                <span className={styles.summaryBasisLabel}>{f.title}</span>
                <p className={styles.summaryBasisValue}>{val?.trim() || '(rien à ajouter)'}</p>
              </div>
            );
          })}
        </div>
      )}

      {priorityPath && (
        <div className={styles.prioritySection}>
          <h4 className={styles.prioritySectionTitle}>MA PISTE PRIORITAIRE</h4>
          <p className={styles.priorityPathName}>{priorityPath.name || priorityPath.starting_resource}</p>
          {whyPriority && (
            <div className={styles.priorityDetail}>
              <strong>POURQUOI JE LA PRIORISE</strong>
              <p>{whyPriority}</p>
            </div>
          )}
          {remainingToVerify && (
            <div className={styles.priorityDetail}>
              <strong>CE QUI RESTE À VÉRIFIER</strong>
              <p>{remainingToVerify}</p>
            </div>
          )}
          {acceptedUnknown && (
            <div className={styles.priorityDetail}>
              <strong>CE QUE J&apos;ACCEPTE DE NE PAS SAVOIR ENCORE</strong>
              <p>{acceptedUnknown}</p>
            </div>
          )}
        </div>
      )}

      <p className={styles.summaryStatement}>
        &ldquo;Tu n&apos;as pas choisi ton avenir. Tu as choisi la piste que tu vas maintenant transformer en Direction testable.&rdquo;
      </p>
    </div>
  );
}

const BASIS_FIELDS = [
  { key: 'facts', title: 'CE QUE JE SAIS', question: 'Quels faits ou éléments concrets pèsent réellement dans ton choix ?' },
  { key: 'hypotheses', title: 'CE QUE JE SUPPOSE', question: 'Qu\'est-ce qui influence ton choix mais reste encore une hypothèse ?' },
  { key: 'preferences', title: 'CE QUE JE PRÉFÈRE', question: 'Qu\'est-ce qui relève simplement de ce que tu veux, apprécies ou préfères ?' },
];

const EMPTY_BASIS = { facts: '', hypotheses: '', preferences: '', acknowledged: { facts: false, hypotheses: false, preferences: false } };

/* ── Decision basis block ────────────────────────────────────────── */
function DecisionBasisBlock({ value, onChange }) {
  const basis = value ?? EMPTY_BASIS;
  const ack = basis.acknowledged ?? {};

  function update(key, text) {
    onChange({ ...basis, [key]: text, acknowledged: { ...ack, [key]: false } });
  }
  function acknowledge(key) {
    onChange({ ...basis, [key]: '', acknowledged: { ...ack, [key]: true } });
  }
  function unacknowledge(key) {
    onChange({ ...basis, acknowledged: { ...ack, [key]: false } });
  }

  const allTreated = BASIS_FIELDS.every(f => basis[f.key]?.trim() || ack[f.key]);

  return (
    <div className={styles.basisBlock}>
      <div className={styles.basisTitle}>SUR QUOI REPOSE MON CHOIX ?</div>
      <p className={styles.basisIntro}>
        Avant de confirmer ta piste prioritaire, prends un moment pour voir si ton arbitrage repose sur des faits, des hypothèses ou des préférences. Les trois sont légitimes — mais ils ne doivent pas être confondus.
      </p>
      {BASIS_FIELDS.map(f => {
        const treated = basis[f.key]?.trim() || ack[f.key];
        return (
          <div key={f.key} className={`${styles.basisField} ${treated ? styles.basisFieldTreated : ''}`}>
            <div className={styles.basisFieldHeader}>
              <span className={styles.basisFieldTitle}>{f.title}</span>
              {treated && <span className={styles.basisCheck}>✓</span>}
            </div>
            <p className={styles.basisQuestion}>{f.question}</p>
            {ack[f.key] ? (
              <div className={styles.basisAcknowledged}>
                <span>Rien à ajouter pour ce point.</span>
                <button type="button" className={styles.basisUndoBtn} onClick={() => unacknowledge(f.key)}>Modifier</button>
              </div>
            ) : (
              <>
                <textarea
                  className={styles.basisTextarea}
                  value={basis[f.key] ?? ''}
                  onChange={e => update(f.key, e.target.value)}
                  placeholder="Quelques mots suffisent…"
                  rows={2}
                />
                {!basis[f.key]?.trim() && (
                  <button type="button" className={styles.basisAckBtn} onClick={() => acknowledge(f.key)}>
                    Rien à ajouter pour ce point
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}
      {!allTreated && (
        <p className={styles.basisHint}>Traite les trois sections pour continuer (ou confirme qu'il n'y a rien à ajouter).</p>
      )}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */
export function SprintThreePanel({ sprint, onMissionUpdate }) {
  const [mode, setMode] = useState('action');
  const [step, setStep] = useState('matrix'); // 'matrix' | 'basis' | 'priority'
  const [view, setView] = useState('form'); // 'form' | 'summary'

  const [retainedPaths, setRetainedPaths] = useState([]);
  const [matrix, setMatrix] = useState([]);
  const [missingInfo, setMissingInfo] = useState(null);
  const [decisionBasis, setDecisionBasis] = useState(EMPTY_BASIS);
  const [priorityPathId, setPriorityPathId] = useState(null);
  const [whyPriority, setWhyPriority] = useState('');
  const [remainingToVerify, setRemainingToVerify] = useState('');
  const [acceptedUnknown, setAcceptedUnknown] = useState('');
  const [s2Changed, setS2Changed] = useState(false);
  const [snapshotPaths, setSnapshotPaths] = useState([]);

  const [s3Status, setS3Status] = useState(null);
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [saveMsg, setSaveMsg] = useState(null);

  useEffect(() => {
    fetch('/api/s3/arbitration', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setRetainedPaths(data.retained_paths ?? []);
        if (data.s3) {
          const s3 = data.s3;
          setS3Status(s3.status);
          setMatrix(s3.matrix ?? []);
          setSnapshotPaths(s3.s2_snapshot_paths ?? []);
          setMissingInfo(s3.missing_info ?? null);
          setDecisionBasis(s3.decision_basis ?? EMPTY_BASIS);
          setPriorityPathId(s3.priority_path_id ?? null);
          setWhyPriority(s3.why_priority ?? '');
          setRemainingToVerify(s3.remaining_to_verify ?? '');
          setAcceptedUnknown(s3.accepted_unknown ?? '');
          setS2Changed(s3.s2_changed ?? false);
          if (s3.status === 'complete') setView('summary');
        } else {
          // Initialize matrix entries for each retained path
          const retained = data.retained_paths ?? [];
          setMatrix(retained.map(p => ({ path_id: p.id, criteria: {} })));
          setSnapshotPaths(retained);
        }
      })
      .catch(() => {});
  }, []);

  const save = useCallback(async (overrides = {}) => {
    setSaving(true);
    setSaveMsg(null);
    const body = {
      matrix: overrides.matrix ?? matrix,
      missing_info: overrides.missingInfo !== undefined ? overrides.missingInfo : missingInfo,
      decision_basis: overrides.decisionBasis !== undefined ? overrides.decisionBasis : decisionBasis,
      priority_path_id: overrides.priorityPathId !== undefined ? overrides.priorityPathId : priorityPathId,
      why_priority: overrides.whyPriority !== undefined ? overrides.whyPriority : whyPriority,
      remaining_to_verify: overrides.remainingToVerify !== undefined ? overrides.remainingToVerify : remainingToVerify,
      accepted_unknown: overrides.acceptedUnknown !== undefined ? overrides.acceptedUnknown : acceptedUnknown,
    };
    try {
      const r = await fetch('/api/s3/arbitration', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const res = await r.json().catch(() => ({}));
      if (r.ok) {
        setSaveMsg('Sauvegardé');
        if (res.s3?.s2_snapshot_paths) setSnapshotPaths(res.s3.s2_snapshot_paths);
      } else {
        setSaveMsg(res.error ?? 'Erreur de sauvegarde');
      }
    } catch {
      setSaveMsg('Erreur réseau');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }, [matrix, missingInfo, decisionBasis, priorityPathId, whyPriority, remainingToVerify, acceptedUnknown]);

  async function handleRefreshS2() {
    try {
      const r = await fetch('/api/s3/arbitration', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrix, missing_info: missingInfo, priority_path_id: priorityPathId, refresh_s2: true }),
      });
      if (r.ok) {
        const data = await r.json();
        setSnapshotPaths(data.s3?.s2_snapshot_paths ?? []);
        setS2Changed(false);
        setSaveMsg('Pistes S2 mises à jour');
      }
    } catch { setSaveMsg('Erreur réseau'); }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await fetch('/api/s3/arbitration', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matrix, missing_info: missingInfo, decision_basis: decisionBasis, priority_path_id: priorityPathId, why_priority: whyPriority, remaining_to_verify: remainingToVerify, accepted_unknown: acceptedUnknown }),
      });
      const r = await fetch('/api/s3/arbitration/submit', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(body.error ?? 'Erreur lors de la finalisation');
      } else {
        setS3Status('complete');
        setSubmissionStatus(body.submission?.status ?? 'complete');
        setView('summary');
        if (onMissionUpdate) onMissionUpdate();
      }
    } catch {
      setError('Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  }

  function updateMatrixRow(pathId, updated) {
    setMatrix(prev => prev.map(r => r.path_id === pathId ? updated : r));
  }

  const pathsForMatrix = snapshotPaths.length > 0 ? snapshotPaths : retainedPaths;
  const allCriteriaFilled = pathsForMatrix.length > 0 && matrix.length === pathsForMatrix.length &&
    matrix.every(row => CRITERIA.every(c => RATINGS.includes(row.criteria?.[c.key]?.rating)));

  const basisTreated = BASIS_FIELDS.every(f => decisionBasis?.[f.key]?.trim() || decisionBasis?.acknowledged?.[f.key]);

  const canSubmit = allCriteriaFilled && basisTreated && !!priorityPathId && whyPriority.trim() && remainingToVerify.trim() && acceptedUnknown.trim();
  const isComplete = s3Status === 'complete';
  const videoUrl = sprint?.video_url ?? null;
  const audioUrl = sprint?.audio_url ?? null;

  const currentStepLabel = step === 'matrix' ? 'Matrice' : step === 'priority' ? 'Piste prioritaire' : 'Synthèse';

  return (
    <div className={styles.panel}>
      {/* Mode tabs */}
      <div className={styles.modeTabs} role="tablist">
        <button role="tab" aria-selected={mode === 'video'}
          className={`${styles.modeTab} ${mode === 'video' ? styles.modeTabActive : ''}`}
          onClick={() => setMode('video')}>
          ▶ Vidéo{!videoUrl && <span className={styles.todoBadge}>À produire</span>}
        </button>
        <button role="tab" aria-selected={mode === 'audio'}
          className={`${styles.modeTab} ${mode === 'audio' ? styles.modeTabActive : ''}`}
          onClick={() => setMode('audio')}>
          ♪ Audio{!audioUrl && <span className={styles.todoBadge}>À produire</span>}
        </button>
        <button role="tab" aria-selected={mode === 'action'}
          className={`${styles.modeTab} ${mode === 'action' ? styles.modeTabActive : ''} ${styles.modeTabAction}`}
          onClick={() => setMode('action')}>
          Passer à l&apos;action
          {isComplete && <span className={styles.doneBadge}>✓</span>}
        </button>
      </div>

      {mode === 'video' && (
        <div className={styles.mediaSection}>
          <MediaPlaceholder type="video" url={videoUrl} />
          <button className={styles.switchToActionBtn} onClick={() => setMode('action')}>Passer à l&apos;action →</button>
        </div>
      )}

      {mode === 'audio' && (
        <div className={styles.mediaSection}>
          <MediaPlaceholder type="audio" url={audioUrl} />
          <button className={styles.switchToActionBtn} onClick={() => setMode('action')}>Passer à l&apos;action →</button>
        </div>
      )}

      {mode === 'action' && (
        <div className={styles.actionSection}>
          <div className={styles.ruleBox}>
            <strong>JE NE CHOISIS PAS MON AVENIR. JE CHOISIS CE QUE JE VAIS TESTER.</strong>
            <p>L&apos;objectif est de rendre l&apos;incertitude gérable — pas de l&apos;éliminer.</p>
          </div>

          {isComplete && view === 'summary' ? (
            <>
              <ArbitrationSummary
                snapshotPaths={snapshotPaths}
                matrix={matrix}
                decisionBasis={decisionBasis}
                priorityPathId={priorityPathId}
                whyPriority={whyPriority}
                remainingToVerify={remainingToVerify}
                acceptedUnknown={acceptedUnknown}
              />
              <div className={styles.completeState}>
                <p className={styles.completeMsg}>✓ PISTE PRIORITAIRE IDENTIFIÉE</p>
                <button className={styles.editBtn} onClick={() => setView('form')}>Consulter ma matrice</button>
              </div>
            </>
          ) : view === 'summary' ? (
            <>
              <ArbitrationSummary
                snapshotPaths={snapshotPaths}
                matrix={matrix}
                decisionBasis={decisionBasis}
                priorityPathId={priorityPathId}
                whyPriority={whyPriority}
                remainingToVerify={remainingToVerify}
                acceptedUnknown={acceptedUnknown}
              />
              <div className={styles.summaryActions}>
                <button className={styles.editBtn} onClick={() => setView('form')}>Modifier</button>
                <button
                  className={styles.submitBtn}
                  onClick={handleSubmit}
                  disabled={submitting || !canSubmit}
                >
                  {submitting ? 'Finalisation…' : 'VALIDER MA PISTE PRIORITAIRE'}
                </button>
                {error && <p className={styles.errorMsg}>{error}</p>}
              </div>
            </>
          ) : (
            <div className={styles.form}>
              {/* S2 changed warning */}
              {s2Changed && (
                <div className={styles.s2ChangedWarning}>
                  <strong>Tes pistes S2 ont changé depuis le début de cette matrice.</strong>
                  <p>Ta matrice en cours est préservée. Veux-tu mettre à jour les pistes comparées ?</p>
                  <button className={styles.refreshS2Btn} type="button" onClick={handleRefreshS2}>
                    Mettre à jour les pistes
                  </button>
                </div>
              )}

              {/* Step nav */}
              <div className={styles.stepNav}>
                <button
                  className={`${styles.stepBtn} ${step === 'matrix' ? styles.stepBtnActive : ''}`}
                  onClick={() => setStep('matrix')} type="button">
                  1 · Matrice {allCriteriaFilled && '✓'}
                </button>
                <button
                  className={`${styles.stepBtn} ${step === 'basis' ? styles.stepBtnActive : ''}`}
                  onClick={() => setStep('basis')} type="button"
                  disabled={!allCriteriaFilled}>
                  2 · Mon raisonnement {basisTreated && '✓'}
                </button>
                <button
                  className={`${styles.stepBtn} ${step === 'priority' ? styles.stepBtnActive : ''}`}
                  onClick={() => setStep('priority')} type="button"
                  disabled={!allCriteriaFilled || !basisTreated}>
                  3 · Piste prioritaire {priorityPathId && '✓'}
                </button>
              </div>

              {/* STEP 1 — Matrix */}
              {step === 'matrix' && (
                <>
                  <div className={styles.sectionTitle}>TES PISTES À ARBITRER</div>

                  {/* S2 recap */}
                  <div className={styles.s2Recap}>
                    {pathsForMatrix.map(path => (
                      <S2PathCard key={path.id} path={path} isSelected={false} selectionMode={false} />
                    ))}
                  </div>

                  <div className={styles.sectionTitle}>TA MATRICE</div>
                  <p className={styles.matrixHint}>
                    Évalue chaque piste sur 7 critères : FORT / MOYEN-À VÉRIFIER / FAIBLE.<br />
                    Aucun calcul automatique ne sera effectué. C&apos;est toi qui décides.
                  </p>

                  {pathsForMatrix.map(path => {
                    const row = matrix.find(r => r.path_id === path.id) ?? { path_id: path.id, criteria: {} };
                    return (
                      <MatrixRow
                        key={path.id}
                        path={path}
                        row={row}
                        onChange={updated => updateMatrixRow(path.id, updated)}
                      />
                    );
                  })}

                  <MissingInfoBlock value={missingInfo} onChange={v => { setMissingInfo(v); save({ missingInfo: v }); }} />

                  <div className={styles.formActions}>
                    <div className={styles.saveRow}>
                      <button className={styles.saveBtn} onClick={() => save()} disabled={saving} type="button">
                        {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                      </button>
                      {saveMsg && <span className={styles.saveMsg}>{saveMsg}</span>}
                    </div>
                    <button
                      className={styles.nextBtn}
                      onClick={() => setStep('basis')}
                      disabled={!allCriteriaFilled}
                      type="button">
                      Sur quoi repose mon choix ? →
                    </button>
                  </div>
                  {!allCriteriaFilled && (
                    <p className={styles.hint}>Évalue tous les critères pour chaque piste pour continuer.</p>
                  )}
                </>
              )}

              {/* STEP 2 — Decision basis */}
              {step === 'basis' && (
                <>
                  <DecisionBasisBlock
                    value={decisionBasis}
                    onChange={v => { setDecisionBasis(v); }}
                  />
                  <div className={styles.formActions}>
                    <button className={styles.backBtn} onClick={() => setStep('matrix')} type="button">← Retour à la matrice</button>
                    <div className={styles.saveRow}>
                      <button className={styles.saveBtn} onClick={() => save({ decisionBasis })} disabled={saving} type="button">
                        {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                      </button>
                      {saveMsg && <span className={styles.saveMsg}>{saveMsg}</span>}
                    </div>
                    <button
                      className={styles.nextBtn}
                      onClick={() => setStep('priority')}
                      disabled={!basisTreated}
                      type="button">
                      Choisir ma piste prioritaire →
                    </button>
                  </div>
                </>
              )}

              {/* STEP 3 — Priority path */}
              {step === 'priority' && (
                <>
                  <div className={styles.sectionTitle}>TA PISTE PRIORITAIRE</div>
                  <p className={styles.priorityHint}>
                    Après avoir comparé tes pistes, laquelle mérite de devenir ta direction testable ? Sélectionne-en une seule.
                  </p>

                  <div className={styles.pathSelectionList}>
                    {pathsForMatrix.map(path => (
                      <S2PathCard
                        key={path.id}
                        path={path}
                        isSelected={priorityPathId === path.id}
                        onSelect={id => setPriorityPathId(id)}
                        selectionMode
                      />
                    ))}
                  </div>

                  {priorityPathId && (
                    <div className={styles.priorityRationale}>
                      <label className={styles.fieldLabel}>POURQUOI JE LA PRIORISE <span className={styles.required}>*</span></label>
                      <textarea
                        className={styles.fieldTextarea}
                        value={whyPriority}
                        onChange={e => setWhyPriority(e.target.value)}
                        placeholder="Ce qui distingue réellement cette piste pour moi en ce moment…"
                        rows={3}
                      />
                      <label className={styles.fieldLabel}>CE QUI RESTE À VÉRIFIER <span className={styles.required}>*</span></label>
                      <textarea
                        className={styles.fieldTextarea}
                        value={remainingToVerify}
                        onChange={e => setRemainingToVerify(e.target.value)}
                        placeholder="Les hypothèses importantes que je n'ai pas encore testées…"
                        rows={3}
                      />
                      <label className={styles.fieldLabel}>CE QUE J&apos;ACCEPTE DE NE PAS SAVOIR ENCORE <span className={styles.required}>*</span></label>
                      <textarea
                        className={styles.fieldTextarea}
                        value={acceptedUnknown}
                        onChange={e => setAcceptedUnknown(e.target.value)}
                        placeholder="Les incertitudes que j'accepte de garder pour avancer quand même…"
                        rows={3}
                      />
                    </div>
                  )}

                  <div className={styles.formActions}>
                    <button className={styles.backBtn} onClick={() => setStep('matrix')} type="button">← Retour à la matrice</button>
                    <div className={styles.saveRow}>
                      <button className={styles.saveBtn} onClick={() => save({ priorityPathId, whyPriority, remainingToVerify, acceptedUnknown, decisionBasis })} disabled={saving} type="button">
                        {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                      </button>
                      {saveMsg && <span className={styles.saveMsg}>{saveMsg}</span>}
                    </div>
                    <button
                      className={styles.previewBtn}
                      onClick={() => setView('summary')}
                      disabled={!canSubmit}
                      type="button">
                      Voir la synthèse →
                    </button>
                  </div>
                  {!canSubmit && (
                    <p className={styles.hint}>
                      {!priorityPathId ? 'Sélectionne ta piste prioritaire.' :
                       !whyPriority.trim() ? 'Explique pourquoi tu la priorises.' :
                       !remainingToVerify.trim() ? 'Indique ce qui reste à vérifier.' :
                       'Indique ce que tu acceptes de ne pas encore savoir.'}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
