/**
 * SprintOnePanel — S1 : TON POINT DE CONTRÔLE
 * Three modes: Vidéo | Audio | Passer à l'action
 * Video/audio show placeholders (À PRODUIRE).
 * Action mode: Inventaire de Départ (5 sections A–E).
 */
import { useState, useEffect, useCallback } from 'react';
import styles from './SprintOnePanel.module.css';

const SECTIONS = [
  {
    key: 'A',
    label: 'CE QUE JE SAIS FAIRE',
    description: 'Qu\'est-ce que tu sais déjà faire suffisamment bien pour que d\'autres personnes puissent en tirer quelque chose ?',
    type: 'multi',
    placeholder: 'Ajoute une compétence ou savoir-faire…',
  },
  {
    key: 'B',
    label: 'CE QUE J\'AI VÉCU',
    description: 'Tes expériences professionnelles et personnelles pertinentes.',
    type: 'multi',
    placeholder: 'Ajoute une expérience…',
  },
  {
    key: 'C',
    label: 'CE QUE JE CONNAIS',
    description: 'Les domaines, environnements, problématiques ou situations que tu connais suffisamment pour les comprendre.',
    type: 'multi',
    placeholder: 'Ajoute un domaine ou contexte que tu connais…',
  },
  {
    key: 'D',
    label: 'CE À QUOI J\'AI DÉJÀ ACCÈS',
    description: 'Réseau, communautés, audience éventuelle, outils, ressources, projets existants.',
    type: 'multi',
    placeholder: 'Ajoute une ressource, un réseau, un outil…',
  },
  {
    key: 'E',
    label: 'MES CONTRAINTES RÉELLES',
    description: 'Ce qui encadre réellement ton projet.',
    type: 'constraints',
  },
];

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
      <p className={styles.placeholderHint}>
        Écouter ou regarder peut t&apos;aider à comprendre.<br />
        Agir est ce qui fait avancer ton projet.
      </p>
    </div>
  );
}

/* ── Multi-entry section (A, B, C, D) ─────────────────────────── */
function MultiSection({ section, entries = [], acknowledged = false, onChange, onAcknowledge }) {
  const [draft, setDraft] = useState('');

  function addEntry() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onChange([...entries, trimmed]);
    setDraft('');
    if (acknowledged) onAcknowledge(false); // unset "rien à ajouter" if entry added
  }

  function removeEntry(idx) {
    onChange(entries.filter((_, i) => i !== idx));
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addEntry();
    }
  }

  const isEmpty = entries.length === 0;
  const isTreated = entries.length > 0 || acknowledged;

  return (
    <div className={`${styles.sectionBlock} ${isTreated ? styles.sectionTreated : ''}`}>
      <div className={styles.sectionLabelRow}>
        <h4 className={styles.sectionLabel}>{section.label}</h4>
        {isTreated && <span className={styles.sectionCheck} aria-hidden>✓</span>}
      </div>
      <p className={styles.sectionDesc}>{section.description}</p>
      <ul className={styles.entryList}>
        {entries.map((e, i) => (
          <li key={i} className={styles.entryItem}>
            <span className={styles.entryText}>{e}</span>
            <button
              className={styles.removeBtn}
              onClick={() => removeEntry(i)}
              aria-label="Supprimer"
              type="button"
            >×</button>
          </li>
        ))}
      </ul>
      {acknowledged && isEmpty && (
        <p className={styles.acknowledgedNote}>
          ✓ Rien à ajouter pour le moment —{' '}
          <button className={styles.undoAckBtn} type="button" onClick={() => onAcknowledge(false)}>
            Annuler
          </button>
        </p>
      )}
      {!acknowledged && (
        <div className={styles.entryInputRow}>
          <input
            className={styles.entryInput}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKey}
            placeholder={section.placeholder}
            type="text"
          />
          <button
            className={styles.addBtn}
            onClick={addEntry}
            type="button"
            disabled={!draft.trim()}
          >Ajouter</button>
        </div>
      )}
      {!acknowledged && isEmpty && section.key !== 'A' && (
        <button
          className={styles.nothingToAddBtn}
          type="button"
          onClick={() => onAcknowledge(true)}
        >
          Rien à ajouter pour le moment
        </button>
      )}
    </div>
  );
}

/* ── Constraints section (E) ────────────────────────────────────── */
function ConstraintsSection({ values = {}, onChange }) {
  function update(field, val) {
    onChange({ ...values, [field]: val });
  }
  const isTreated = typeof values.available_time === 'string' && values.available_time.trim();
  return (
    <div className={`${styles.sectionBlock} ${isTreated ? styles.sectionTreated : ''}`}>
      <div className={styles.sectionLabelRow}>
        <h4 className={styles.sectionLabel}>MES CONTRAINTES RÉELLES</h4>
        {isTreated && <span className={styles.sectionCheck} aria-hidden>✓</span>}
      </div>
      <p className={styles.sectionDesc}>Ce qui encadre réellement ton projet.</p>
      <label className={styles.fieldLabel}>Temps réellement disponible</label>
      <input
        className={styles.constraintInput}
        value={values.available_time ?? ''}
        onChange={e => update('available_time', e.target.value)}
        placeholder="Ex. 6h par semaine, le week-end uniquement…"
        type="text"
      />
      <label className={styles.fieldLabel}>Contraintes importantes</label>
      <textarea
        className={styles.constraintTextarea}
        value={values.constraints ?? ''}
        onChange={e => update('constraints', e.target.value)}
        placeholder="Ex. Salariée à temps plein, contraintes financières…"
        rows={2}
      />
      <label className={styles.fieldLabel}>Contexte à prendre en compte</label>
      <textarea
        className={styles.constraintTextarea}
        value={values.context ?? ''}
        onChange={e => update('context', e.target.value)}
        placeholder="Ex. Famille avec enfants en bas âge, déménagement prévu…"
        rows={2}
      />
    </div>
  );
}

/* ── Synthesis view ─────────────────────────────────────────────── */
function InventorySummary({ sections, acknowledged = {}, observation }) {
  const LABELS = { A: 'Ce que je sais faire', B: 'Ce que j\'ai vécu', C: 'Ce que je connais', D: 'Ce à quoi j\'ai déjà accès', E: 'Mes contraintes réelles' };
  return (
    <div className={styles.summary}>
      <h3 className={styles.summaryTitle}>MON INVENTAIRE DE DÉPART</h3>
      {['A','B','C','D'].map(k => {
        const entries = sections?.[k] ?? [];
        const isAcknowledged = acknowledged[k];
        if (!entries.length && !isAcknowledged) return null;
        return (
          <div key={k} className={styles.summarySect}>
            <h4 className={styles.summarySectTitle}>{LABELS[k]}</h4>
            {entries.length > 0 ? (
              <ul className={styles.summaryList}>
                {entries.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            ) : (
              <p className={styles.summarySectEmpty}>Rien à ajouter pour le moment.</p>
            )}
          </div>
        );
      })}
      {sections?.E && (
        <div className={styles.summarySect}>
          <h4 className={styles.summarySectTitle}>{LABELS.E}</h4>
          {sections.E.available_time && <p><strong>Temps :</strong> {sections.E.available_time}</p>}
          {sections.E.constraints && <p><strong>Contraintes :</strong> {sections.E.constraints}</p>}
          {sections.E.context && <p><strong>Contexte :</strong> {sections.E.context}</p>}
        </div>
      )}
      {observation && (
        <div className={styles.summarySect}>
          <h4 className={styles.summarySectTitle}>CE QUE JE REMARQUE</h4>
          <p className={styles.observationText}>{observation}</p>
        </div>
      )}
      <p className={styles.summaryStatement}>
        &ldquo;Je sais maintenant avec quoi je peux réellement commencer à construire.&rdquo;
      </p>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────── */
export function SprintOnePanel({ sprint, onMissionUpdate }) {
  const [mode, setMode] = useState('action'); // 'video' | 'audio' | 'action'
  const [view, setView] = useState('form');   // 'form' | 'summary'
  const [sections, setSections] = useState({
    A: [], B: [], C: [], D: [], E: { available_time: '', constraints: '', context: '' },
  });
  const [acknowledged, setAcknowledged] = useState({}); // { B: true, C: true, D: true }
  const [observation, setObservation] = useState('');
  const [inventoryStatus, setInventoryStatus] = useState(null);
  const [submissionStatus, setSubmissionStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [saveMsg, setSaveMsg] = useState(null);

  /* Load existing inventory */
  useEffect(() => {
    fetch('/api/s1/inventory', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.inventory) {
          const inv = data.inventory;
          setInventoryStatus(inv.status);
          setSections(s => ({ ...s, ...(inv.sections ?? {}) }));
          setAcknowledged(inv.acknowledged ?? {});
          setObservation(inv.observation ?? '');
          if (inv.status === 'complete') setView('summary');
        }
      })
      .catch(() => {});
  }, []);

  /* Auto-save after section changes (debounce via saveInventory call) */
  const saveInventory = useCallback(async (sects, ack, obs) => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const r = await fetch('/api/s1/inventory', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections: sects, acknowledged: ack, observation: obs }),
      });
      if (r.ok) setSaveMsg('Sauvegardé');
    } catch {
      setSaveMsg('Erreur de sauvegarde');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 2000);
    }
  }, []);

  function updateSection(key, value) {
    setSections(prev => ({ ...prev, [key]: value }));
  }

  function updateAcknowledged(key, value) {
    setAcknowledged(prev => {
      const next = { ...prev };
      if (value) next[key] = true;
      else delete next[key];
      return next;
    });
  }

  function handleSave() {
    saveInventory(sections, acknowledged, observation);
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      // Save first
      await fetch('/api/s1/inventory', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections, acknowledged, observation }),
      });
      // Then submit
      const r = await fetch('/api/s1/inventory/submit', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(body.error ?? 'Erreur lors de la finalisation');
      } else {
        setInventoryStatus('complete');
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

  const isComplete = inventoryStatus === 'complete';
  const hasA = (sections.A ?? []).some(e => e?.trim());
  const hasB = (sections.B ?? []).some(e => e?.trim()) || !!acknowledged.B;
  const hasC = (sections.C ?? []).some(e => e?.trim()) || !!acknowledged.C;
  const hasD = (sections.D ?? []).some(e => e?.trim()) || !!acknowledged.D;
  const hasE = !!(sections.E?.available_time?.trim());
  const hasMinimum = hasA && hasB && hasC && hasD && hasE;
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
          {videoUrl ? '▶ Vidéo' : '▶ Vidéo'}
          {!videoUrl && <span className={styles.todoBadge}>À produire</span>}
        </button>
        <button
          role="tab"
          aria-selected={mode === 'audio'}
          className={`${styles.modeTab} ${mode === 'audio' ? styles.modeTabActive : ''}`}
          onClick={() => setMode('audio')}
        >
          {audioUrl ? '♪ Audio' : '♪ Audio'}
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
          {/* Rule reminder */}
          <div className={styles.ruleBox}>
            <strong>JE N&apos;AJOUTE PAS. J&apos;INVENTORIE.</strong>
            <p>Fais l&apos;inventaire de ce que tu possèdes déjà — sans choisir de direction, sans générer des idées, sans évaluer la rentabilité.</p>
          </div>

          {isComplete && view === 'summary' ? (
            <>
              <InventorySummary sections={sections} acknowledged={acknowledged} observation={observation} />
              <div className={styles.completeState}>
                <p className={styles.completeMsg}>
                  {submissionStatus === 'submitted' || inventoryStatus === 'complete'
                    ? '✓ Inventaire soumis — en attente de validation'
                    : '✓ Inventaire complété'}
                </p>
                <button
                  className={styles.editBtn}
                  onClick={() => setView('form')}
                >
                  Modifier mon inventaire
                </button>
              </div>
            </>
          ) : view === 'summary' ? (
            <>
              <InventorySummary sections={sections} acknowledged={acknowledged} observation={observation} />
              <div className={styles.summaryActions}>
                <button className={styles.editBtn} onClick={() => setView('form')}>
                  Modifier
                </button>
                <button
                  className={styles.submitBtn}
                  onClick={handleSubmit}
                  disabled={submitting || !hasMinimum}
                >
                  {submitting ? 'Finalisation…' : 'TERMINER MON INVENTAIRE'}
                </button>
                {error && <p className={styles.errorMsg}>{error}</p>}
              </div>
            </>
          ) : (
            /* Form view */
            <div className={styles.form}>
              {SECTIONS.map(sect => (
                sect.type === 'multi' ? (
                  <MultiSection
                    key={sect.key}
                    section={sect}
                    entries={sections[sect.key] ?? []}
                    acknowledged={!!acknowledged[sect.key]}
                    onChange={val => updateSection(sect.key, val)}
                    onAcknowledge={val => updateAcknowledged(sect.key, val)}
                  />
                ) : (
                  <ConstraintsSection
                    key={sect.key}
                    values={sections[sect.key] ?? {}}
                    onChange={val => updateSection(sect.key, val)}
                  />
                )
              ))}

              {/* CE QUE JE REMARQUE */}
              <div className={styles.sectionBlock}>
                <h4 className={styles.sectionLabel}>CE QUE JE REMARQUE</h4>
                <p className={styles.sectionDesc}>
                  Qu&apos;est-ce que tu observes en regardant cet inventaire ? (facultatif)
                </p>
                <textarea
                  className={styles.observationInput}
                  value={observation}
                  onChange={e => setObservation(e.target.value)}
                  placeholder="Je remarque que…"
                  rows={3}
                />
              </div>

              <div className={styles.formActions}>
                <div className={styles.saveRow}>
                  <button className={styles.saveBtn} onClick={handleSave} disabled={saving} type="button">
                    {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                  </button>
                  {saveMsg && <span className={styles.saveMsg}>{saveMsg}</span>}
                </div>
                <button
                  className={styles.previewBtn}
                  onClick={() => setView('summary')}
                  disabled={!hasMinimum}
                  type="button"
                >
                  Voir la synthèse →
                </button>
              </div>

              {!hasMinimum && (
                <p className={styles.hint}>
                  Pour voir la synthèse, traite les 5 sections.
                  {!hasA && ' A : au moins une compétence.'}
                  {hasA && !hasB && ' B : ajoute une expérience ou confirme "rien à ajouter".'}
                  {hasA && hasB && !hasC && ' C : ajoute un domaine ou confirme "rien à ajouter".'}
                  {hasA && hasB && hasC && !hasD && ' D : ajoute une ressource ou confirme "rien à ajouter".'}
                  {hasA && hasB && hasC && hasD && !hasE && ' E : indique ton temps disponible.'}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
