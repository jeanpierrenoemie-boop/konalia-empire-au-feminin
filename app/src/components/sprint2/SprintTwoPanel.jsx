/**
 * SprintTwoPanel — S2 : TES RESSOURCES EXPLOITABLES
 * Three modes: Vidéo | Audio | Passer à l'action
 * Action mode: MES PISTES À ARBITRER
 * Prefills from S1 inventory (read-only recall).
 */
import { useState, useEffect, useCallback } from 'react';
import styles from './SprintTwoPanel.module.css';

const MAX_ACTIVE = 5;
const MAX_RETAINED = 3;

/* ── Media placeholder ─────────────────────────────────────────── */
function MediaPlaceholder({ type, url }) {
  if (url) {
    if (type === 'video') {
      return (
        <div className={styles.mediaContainer}>
          <video controls src={url} className={styles.video} />
        </div>
      );
    }
    if (type === 'audio') {
      return (
        <div className={styles.mediaContainer}>
          <audio controls src={url} className={styles.audio} />
        </div>
      );
    }
  }
  return (
    <div className={styles.mediaPlaceholder}>
      <div className={styles.placeholderIcon}>{type === 'video' ? '▶' : '♪'}</div>
      <p className={styles.placeholderTitle}>À PRODUIRE</p>
      <p className={styles.placeholderText}>
        Tu peux apprendre en mouvement.<br />
        Tu reviens dans le programme pour décider et agir.
      </p>
    </div>
  );
}

/* ── S1 recall block ────────────────────────────────────────────── */
function S1Recall({ inventory }) {
  const [expanded, setExpanded] = useState(false);
  if (!inventory) return null;
  const s = inventory.sections ?? {};
  const ack = inventory.acknowledged ?? {};
  const items = ['A','B','C','D'].flatMap(k => {
    if (Array.isArray(s[k]) && s[k].some(e => e?.trim())) return s[k].filter(e => e?.trim());
    if (ack[k]) return [];
    return [];
  });
  if (!items.length) return null;

  return (
    <div className={styles.s1RecallBlock}>
      <button
        className={styles.s1RecallToggle}
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        <span>CE QUE TU AS DÉJÀ — rappel de ton inventaire S1</span>
        <span className={styles.s1RecallChevron}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className={styles.s1RecallContent}>
          <p className={styles.s1RecallHint}>
            Ces ressources sont le point de départ de tes pistes. Tu n&apos;as pas besoin de toutes les exploiter.
          </p>
          {['A','B','C','D'].map(k => {
            const entries = Array.isArray(s[k]) ? s[k].filter(e => e?.trim()) : [];
            if (!entries.length) return null;
            const labels = { A: 'Ce que je sais faire', B: 'Ce que j\'ai vécu', C: 'Ce que je connais', D: 'Ce à quoi j\'ai déjà accès' };
            return (
              <div key={k} className={styles.s1RecallSection}>
                <h5 className={styles.s1RecallSectTitle}>{labels[k]}</h5>
                <ul className={styles.s1RecallList}>
                  {entries.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            );
          })}
          {s.E?.available_time && (
            <div className={styles.s1RecallSection}>
              <h5 className={styles.s1RecallSectTitle}>Mes contraintes</h5>
              <p>{s.E.available_time}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Path form ──────────────────────────────────────────────────── */
function PathForm({ onAdd, disabled }) {
  const empty = { name: '', starting_resource: '', person: '', problem: '', what_i_know: '', what_i_assume: '', what_i_need_to_verify: '', acknowledged: {} };
  const [draft, setDraft] = useState(empty);

  function update(field, val) {
    setDraft(prev => ({ ...prev, [field]: val }));
  }

  function toggleAck(field) {
    setDraft(prev => {
      const ack = { ...prev.acknowledged };
      if (ack[field]) delete ack[field];
      else ack[field] = true;
      return { ...prev, acknowledged: ack };
    });
  }

  function canAdd() {
    return draft.starting_resource.trim() && draft.person.trim() && draft.problem.trim();
  }

  function handleAdd() {
    if (!canAdd()) return;
    onAdd({ ...draft });
    setDraft(empty);
  }

  const OPTIONAL_FIELDS = [
    { key: 'what_i_know', label: 'Ce que je sais' },
    { key: 'what_i_assume', label: 'Ce que je suppose' },
    { key: 'what_i_need_to_verify', label: 'Ce que je dois vérifier' },
  ];

  return (
    <div className={styles.pathForm}>
      <h4 className={styles.pathFormTitle}>TRANSFORME UNE RESSOURCE EN PISTE</h4>
      <p className={styles.pathFormDesc}>
        Choisis une ressource de ton inventaire. Pense à une personne qui pourrait en bénéficier. Formule le problème que tu pourrais résoudre pour elle.
      </p>

      <label className={styles.fieldLabel}>Nom de la piste (optionnel)</label>
      <input
        className={styles.fieldInput}
        value={draft.name}
        onChange={e => update('name', e.target.value)}
        placeholder="Ex. Formation design pour PME…"
        type="text"
      />

      <label className={styles.fieldLabel}>Ressource de départ <span className={styles.required}>*</span></label>
      <input
        className={styles.fieldInput}
        value={draft.starting_resource}
        onChange={e => update('starting_resource', e.target.value)}
        placeholder="Ex. 10 ans en comptabilité, réseau RH, maîtrise de Excel…"
        type="text"
      />

      <label className={styles.fieldLabel}>Personne concernée <span className={styles.required}>*</span></label>
      <input
        className={styles.fieldInput}
        value={draft.person}
        onChange={e => update('person', e.target.value)}
        placeholder="Ex. Dirigeantes de TPE, freelances débutantes…"
        type="text"
      />

      <label className={styles.fieldLabel}>Problème possible <span className={styles.required}>*</span></label>
      <textarea
        className={styles.fieldTextarea}
        value={draft.problem}
        onChange={e => update('problem', e.target.value)}
        placeholder="Ex. Elles peinent à gérer leur trésorerie seules…"
        rows={2}
      />

      {OPTIONAL_FIELDS.map(({ key, label }) => (
        <div key={key} className={styles.optionalFieldBlock}>
          <label className={styles.fieldLabel}>{label}</label>
          {draft.acknowledged[key] ? (
            <p className={styles.acknowledgedNote}>
              ✓ Rien à ajouter —{' '}
              <button className={styles.undoAckBtn} type="button" onClick={() => toggleAck(key)}>Annuler</button>
            </p>
          ) : (
            <>
              <textarea
                className={styles.fieldTextarea}
                value={draft[key]}
                onChange={e => update(key, e.target.value)}
                placeholder={`${label}…`}
                rows={2}
              />
              {!draft[key].trim() && (
                <button className={styles.nothingToAddBtn} type="button" onClick={() => toggleAck(key)}>
                  Rien à ajouter pour le moment
                </button>
              )}
            </>
          )}
        </div>
      ))}

      <button
        className={styles.addPathBtn}
        type="button"
        onClick={handleAdd}
        disabled={disabled || !canAdd()}
      >
        Ajouter cette piste
      </button>
    </div>
  );
}

/* ── Path card ──────────────────────────────────────────────────── */
function PathCard({ path, onStatusChange, onRemove, retainedCount }) {
  const canRetain = path.status === 'retained' || retainedCount < MAX_RETAINED;

  return (
    <div className={`${styles.pathCard} ${styles[`pathCard_${path.status}`]}`}>
      <div className={styles.pathCardHeader}>
        <span className={styles.pathName}>{path.name || path.starting_resource}</span>
        <div className={styles.pathBadges}>
          <span className={`${styles.statusBadge} ${styles[`badge_${path.status}`]}`}>
            {path.status === 'exploring' ? 'En exploration' : path.status === 'retained' ? 'Retenue' : 'Écartée'}
          </span>
        </div>
      </div>
      <div className={styles.pathChain}>
        <span className={styles.chainPart}><strong>Ressource :</strong> {path.starting_resource}</span>
        <span className={styles.chainArrow}>→</span>
        <span className={styles.chainPart}><strong>Personne :</strong> {path.person}</span>
        <span className={styles.chainArrow}>→</span>
        <span className={styles.chainPart}><strong>Problème :</strong> {path.problem}</span>
      </div>
      <div className={styles.pathActions}>
        {path.status !== 'retained' && (
          <button
            className={styles.retainBtn}
            type="button"
            onClick={() => onStatusChange(path.id, 'retained')}
            disabled={!canRetain}
            title={!canRetain ? `Maximum ${MAX_RETAINED} pistes retenues` : ''}
          >
            Retenir pour arbitrage
          </button>
        )}
        {path.status === 'retained' && (
          <button
            className={styles.exploreBtn}
            type="button"
            onClick={() => onStatusChange(path.id, 'exploring')}
          >
            Remettre en exploration
          </button>
        )}
        {path.status !== 'discarded' && (
          <button
            className={styles.discardBtn}
            type="button"
            onClick={() => onStatusChange(path.id, 'discarded')}
          >
            Écarter
          </button>
        )}
        {path.status === 'discarded' && (
          <button
            className={styles.exploreBtn}
            type="button"
            onClick={() => onStatusChange(path.id, 'exploring')}
          >
            Remettre en exploration
          </button>
        )}
        <button
          className={styles.removeBtn}
          type="button"
          onClick={() => onRemove(path.id)}
          aria-label="Supprimer"
        >×</button>
      </div>
    </div>
  );
}

/* ── Synthesis view ─────────────────────────────────────────────── */
function PathsSummary({ paths }) {
  const retained = (paths ?? []).filter(p => p.status === 'retained');
  return (
    <div className={styles.summary}>
      <h3 className={styles.summaryTitle}>MES PISTES À ARBITRER</h3>
      {retained.length === 0 ? (
        <p className={styles.summaryEmpty}>Aucune piste retenue pour le moment.</p>
      ) : (
        retained.map((p, i) => (
          <div key={p.id} className={styles.summaryPath}>
            <div className={styles.summaryPathNum}>{i + 1}</div>
            <div className={styles.summaryPathBody}>
              {p.name && <h4 className={styles.summaryPathName}>{p.name}</h4>}
              <div className={styles.summaryChain}>
                <span><strong>Ressource :</strong> {p.starting_resource}</span>
                <span><strong>Personne :</strong> {p.person}</span>
                <span><strong>Problème :</strong> {p.problem}</span>
              </div>
              {p.what_i_know && <p className={styles.summaryNote}><strong>Je sais :</strong> {p.what_i_know}</p>}
              {p.what_i_assume && <p className={styles.summaryNote}><strong>Je suppose :</strong> {p.what_i_assume}</p>}
              {p.what_i_need_to_verify && <p className={styles.summaryNote}><strong>À vérifier :</strong> {p.what_i_need_to_verify}</p>}
            </div>
          </div>
        ))
      )}
      <p className={styles.summaryStatement}>
        &ldquo;Tu n&apos;as pas encore choisi ta direction. Tu as identifié ce qui mérite d&apos;être examiné.&rdquo;
      </p>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */
export function SprintTwoPanel({ sprint, onMissionUpdate }) {
  const [mode, setMode] = useState('action'); // 'video' | 'audio' | 'action'
  const [view, setView] = useState('form');   // 'form' | 'summary'
  const [paths, setPaths] = useState([]);
  const [s2Status, setS2Status] = useState(null);
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [s1Inventory, setS1Inventory] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [saveMsg, setSaveMsg] = useState(null);

  /* Load S1 inventory for recall */
  useEffect(() => {
    fetch('/api/s1/inventory', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.inventory) setS1Inventory(data.inventory); })
      .catch(() => {});
  }, []);

  /* Load existing S2 paths */
  useEffect(() => {
    fetch('/api/s2/paths', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.s2) {
          setS2Status(data.s2.status);
          setPaths(data.s2.paths ?? []);
          if (data.s2.status === 'complete') setView('summary');
        }
      })
      .catch(() => {});
  }, []);

  const savePaths = useCallback(async (updatedPaths) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch('/api/s2/paths', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: updatedPaths }),
      });
      if (r.ok) setSaveMsg('Sauvegardé');
      else {
        const body = await r.json().catch(() => ({}));
        setSaveMsg(body.error ?? 'Erreur de sauvegarde');
      }
    } catch {
      setSaveMsg('Erreur réseau');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }, []);

  function addPath(pathData) {
    const newPath = { ...pathData, id: crypto.randomUUID(), status: 'exploring' };
    const updated = [...paths, newPath];
    setPaths(updated);
    savePaths(updated);
  }

  function changeStatus(id, status) {
    const updated = paths.map(p => p.id === id ? { ...p, status } : p);
    setPaths(updated);
    savePaths(updated);
  }

  function removePath(id) {
    const updated = paths.filter(p => p.id !== id);
    setPaths(updated);
    savePaths(updated);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await savePaths(paths);
      const r = await fetch('/api/s2/paths/submit', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(body.error ?? 'Erreur lors de la finalisation');
      } else {
        setS2Status('complete');
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

  const activePaths = paths.filter(p => p.status !== 'discarded');
  const retainedPaths = paths.filter(p => p.status === 'retained');
  const discardedPaths = paths.filter(p => p.status === 'discarded');
  const isComplete = s2Status === 'complete';
  const canSubmit = retainedPaths.length >= 1 && retainedPaths.length <= MAX_RETAINED;
  const videoUrl = sprint?.video_url ?? null;
  const audioUrl = sprint?.audio_url ?? null;

  return (
    <div className={styles.panel}>
      {/* Mode tabs */}
      <div className={styles.modeTabs} role="tablist">
        <button
          role="tab"
          aria-selected={mode === 'video'}
          className={`${styles.modeTab} ${mode === 'video' ? styles.modeTabActive : ''}`}
          onClick={() => setMode('video')}
        >
          ▶ Vidéo
          {!videoUrl && <span className={styles.todoBadge}>À produire</span>}
        </button>
        <button
          role="tab"
          aria-selected={mode === 'audio'}
          className={`${styles.modeTab} ${mode === 'audio' ? styles.modeTabActive : ''}`}
          onClick={() => setMode('audio')}
        >
          ♪ Audio
          {!audioUrl && <span className={styles.todoBadge}>À produire</span>}
        </button>
        <button
          role="tab"
          aria-selected={mode === 'action'}
          className={`${styles.modeTab} ${mode === 'action' ? styles.modeTabActive : ''} ${styles.modeTabAction}`}
          onClick={() => setMode('action')}
        >
          Passer à l&apos;action
          {isComplete && <span className={styles.doneBadge}>✓</span>}
        </button>
      </div>

      {/* Video mode */}
      {mode === 'video' && (
        <div className={styles.mediaSection}>
          <MediaPlaceholder type="video" url={videoUrl} />
          <p className={styles.mediaCTA}>
            Écouter ou regarder peut t&apos;aider à comprendre.<br />
            <strong>Agir est ce qui fait avancer ton projet.</strong>
          </p>
          <button className={styles.switchToActionBtn} onClick={() => setMode('action')}>
            Passer à l&apos;action →
          </button>
        </div>
      )}

      {/* Audio mode */}
      {mode === 'audio' && (
        <div className={styles.mediaSection}>
          <MediaPlaceholder type="audio" url={audioUrl} />
          <p className={styles.mediaCTA}>
            Tu peux apprendre en mouvement.<br />
            <strong>Tu reviens dans le programme pour décider et agir.</strong>
          </p>
          <button className={styles.switchToActionBtn} onClick={() => setMode('action')}>
            Passer à l&apos;action →
          </button>
        </div>
      )}

      {/* Action mode */}
      {mode === 'action' && (
        <div className={styles.actionSection}>
          <div className={styles.ruleBox}>
            <strong>LE BUT N&apos;EST PAS DE TROUVER TOUTES LES POSSIBILITÉS.</strong>
            <p>Parmi ce que tu as déjà, quelles pistes méritent d&apos;être examinées ? Retiens entre 1 et {MAX_RETAINED} pistes pour arbitrage.</p>
          </div>

          {isComplete && view === 'summary' ? (
            <>
              <PathsSummary paths={paths} />
              <div className={styles.completeState}>
                <p className={styles.completeMsg}>
                  {submissionStatus === 'submitted' || isComplete
                    ? '✓ Pistes soumises — en attente de validation'
                    : '✓ Pistes complétées'}
                </p>
                <button className={styles.editBtn} onClick={() => setView('form')}>
                  Modifier mes pistes
                </button>
              </div>
            </>
          ) : view === 'summary' ? (
            <>
              <PathsSummary paths={paths} />
              <div className={styles.summaryActions}>
                <button className={styles.editBtn} onClick={() => setView('form')}>
                  Modifier
                </button>
                <button
                  className={styles.submitBtn}
                  onClick={handleSubmit}
                  disabled={submitting || !canSubmit}
                >
                  {submitting ? 'Finalisation…' : 'TERMINER MES PISTES À ARBITRER'}
                </button>
                {error && <p className={styles.errorMsg}>{error}</p>}
              </div>
            </>
          ) : (
            <div className={styles.form}>
              <S1Recall inventory={s1Inventory} />

              {/* Active paths counter */}
              {activePaths.length > 0 && (
                <div className={styles.pathsCounter}>
                  <span>{activePaths.length}/{MAX_ACTIVE} pistes actives</span>
                  {retainedPaths.length > 0 && (
                    <span className={styles.retainedCount}>
                      {retainedPaths.length}/{MAX_RETAINED} retenues pour arbitrage
                    </span>
                  )}
                </div>
              )}

              {/* Active paths list */}
              {activePaths.length > 0 && (
                <div className={styles.pathsList}>
                  <h4 className={styles.pathsListTitle}>TES PISTES ACTIVES</h4>
                  {activePaths.map(path => (
                    <PathCard
                      key={path.id}
                      path={path}
                      onStatusChange={changeStatus}
                      onRemove={removePath}
                      retainedCount={retainedPaths.length}
                    />
                  ))}
                </div>
              )}

              {/* Add path form — only when under MAX_ACTIVE */}
              {activePaths.length < MAX_ACTIVE ? (
                <PathForm onAdd={addPath} disabled={saving} />
              ) : (
                <div className={styles.maxActiveNotice}>
                  Tu as atteint la limite de {MAX_ACTIVE} pistes actives. Écarte une piste pour en ajouter une nouvelle.
                </div>
              )}

              {/* Discarded paths (collapsed) */}
              {discardedPaths.length > 0 && (
                <details className={styles.discardedDetails}>
                  <summary className={styles.discardedSummary}>
                    Pistes écartées ({discardedPaths.length})
                  </summary>
                  {discardedPaths.map(path => (
                    <PathCard
                      key={path.id}
                      path={path}
                      onStatusChange={changeStatus}
                      onRemove={removePath}
                      retainedCount={retainedPaths.length}
                    />
                  ))}
                </details>
              )}

              <div className={styles.formActions}>
                <div className={styles.saveRow}>
                  <button className={styles.saveBtn} onClick={() => savePaths(paths)} disabled={saving} type="button">
                    {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                  </button>
                  {saveMsg && <span className={styles.saveMsg}>{saveMsg}</span>}
                </div>
                <button
                  className={styles.previewBtn}
                  onClick={() => setView('summary')}
                  disabled={!canSubmit}
                  type="button"
                >
                  Voir la synthèse →
                </button>
              </div>

              {!canSubmit && (
                <p className={styles.hint}>
                  {retainedPaths.length === 0
                    ? `Retiens au moins 1 piste pour l'arbitrage (max ${MAX_RETAINED}).`
                    : retainedPaths.length > MAX_RETAINED
                    ? `Maximum ${MAX_RETAINED} pistes retenues — écarte-en une.`
                    : ''}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
