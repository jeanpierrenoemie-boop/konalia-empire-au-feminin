import { useState, useEffect, useCallback } from 'react';
import { LoadingState } from '../../components/states/LoadingState';
import { ErrorState } from '../../components/states/ErrorState';
import styles from './ParkingPage.module.css';
import pageStyles from './Page.module.css';

const STATUS_CONFIG = {
  AGIR_MAINTENANT:  { label: 'Agir maintenant',  color: 'vert',   icon: '▶' },
  TESTER_PLUS_TARD: { label: 'Tester plus tard',  color: 'orange', icon: '○' },
  PARKING:          { label: 'Parking',           color: 'muted',  icon: '◫' },
  ABANDONNER:       { label: 'Abandonner',        color: 'rouge',  icon: '⊘' },
};

const QUESTIONS = [
  { key: 'pourquoi_maintenant',    label: 'Pourquoi maintenant ?',                type: 'text' },
  { key: 'sert_objectif_90j',      label: 'Sert-elle l\'objectif 90 jours ?',     type: 'bool' },
  { key: 'sert_priorite_actuelle', label: 'Sert-elle la priorité actuelle ?',      type: 'bool' },
  { key: 'necessaire_maintenant',  label: 'Est-elle nécessaire maintenant ?',      type: 'bool' },
  { key: 'que_remplace',           label: 'Que remplace-t-elle ?',                type: 'text' },
  { key: 'quel_cout',              label: 'Quel coût ? (temps, attention, argent)', type: 'text' },
  { key: 'option_plus_simple',     label: 'Existe-t-il une option plus simple ?', type: 'text' },
];

function suggestStatus(answers) {
  const { sert_objectif_90j, sert_priorite_actuelle, necessaire_maintenant } = answers;
  if (sert_objectif_90j && sert_priorite_actuelle && necessaire_maintenant) return 'AGIR_MAINTENANT';
  if (sert_objectif_90j && !sert_priorite_actuelle) return 'TESTER_PLUS_TARD';
  if (!sert_objectif_90j) return 'PARKING';
  return 'PARKING';
}

function IdeaCard({ idea, onStatusChange }) {
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const cfg = STATUS_CONFIG[idea.dispersion_status] ?? STATUS_CONFIG.PARKING;

  async function applyStatusChange() {
    if (!newStatus) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/parking/${idea.id}/status`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispersion_status: newStatus }),
      });
      if (r.ok) { setChanging(false); setNewStatus(''); onStatusChange(); }
    } finally { setSaving(false); }
  }

  return (
    <div className={`${styles.card} ${styles[`card_${cfg.color}`]}`}>
      <div className={styles.cardHeader}>
        <span className={styles.cardIcon} aria-hidden>{cfg.icon}</span>
        <span className={styles.cardTitle}>{idea.title}</span>
        <span className={`${styles.statusChip} ${styles[`chip_${cfg.color}`]}`}>{cfg.label}</span>
        <button className={styles.expandBtn} onClick={() => setOpen(o => !o)} aria-expanded={open}>
          {open ? '▲' : '▼'}
        </button>
      </div>

      {open && (
        <div className={styles.cardBody}>
          {idea.description && <p className={styles.desc}>{idea.description}</p>}

          <div className={styles.answers}>
            {QUESTIONS.map(q => {
              const val = idea[q.key];
              if (val == null || val === '') return null;
              return (
                <div key={q.key} className={styles.answer}>
                  <span className={styles.answerQ}>{q.label}</span>
                  <span className={styles.answerA}>
                    {q.type === 'bool'
                      ? (val ? 'Oui' : 'Non')
                      : val}
                  </span>
                </div>
              );
            })}
          </div>

          {idea.status_reason && (
            <p className={styles.statusReason}>Raison du statut : {idea.status_reason}</p>
          )}

          {changing ? (
            <div className={styles.changeStatus}>
              <select value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                <option value="">— choisir un nouveau statut —</option>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <button className={styles.saveBtn} onClick={applyStatusChange} disabled={!newStatus || saving}>
                {saving ? '…' : 'Confirmer'}
              </button>
              <button className={styles.cancelBtn} onClick={() => { setChanging(false); setNewStatus(''); }}>
                Annuler
              </button>
            </div>
          ) : (
            <button className={styles.changeBtn} onClick={() => setChanging(true)}>
              Changer le statut
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NewIdeaForm({ onCreated, onCancel }) {
  const [step, setStep] = useState('questions'); // 'questions' → 'confirm'
  const [form, setForm] = useState({
    title: '',
    description: '',
    pourquoi_maintenant: '',
    sert_objectif_90j: null,
    sert_priorite_actuelle: null,
    necessaire_maintenant: null,
    que_remplace: '',
    quel_cout: '',
    option_plus_simple: '',
    dispersion_status: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  function handleEvaluate(e) {
    e.preventDefault();
    const suggested = suggestStatus(form);
    set('dispersion_status', suggested);
    setStep('confirm');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      const r = await fetch('/api/parking', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await r.json();
      if (!r.ok) { setError(body.error ?? 'Erreur'); return; }
      onCreated(body);
    } finally { setSaving(false); }
  }

  if (step === 'confirm') return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.formTitle}>STOP DISPERSION — Évaluation</h3>

      <div className={styles.evaluationResult}>
        <span className={styles.evalLabel}>Idée :</span>
        <strong>{form.title}</strong>
      </div>

      <div className={styles.answerSummary}>
        {QUESTIONS.map(q => {
          const val = form[q.key];
          if (val == null || val === '') return null;
          return (
            <div key={q.key} className={styles.evalRow}>
              <span className={styles.evalQ}>{q.label}</span>
              <span className={styles.evalA}>
                {q.type === 'bool' ? (val ? 'Oui' : 'Non') : val}
              </span>
            </div>
          );
        })}
      </div>

      <div className={styles.suggestionBlock}>
        <span className={styles.suggestionLabel}>Statut suggéré :</span>
        <span className={`${styles.statusChip} ${styles[`chip_${STATUS_CONFIG[form.dispersion_status]?.color}`]}`}>
          {STATUS_CONFIG[form.dispersion_status]?.label}
        </span>
      </div>

      <div className={styles.statusOverride}>
        <label className={styles.formLabel}>Confirmer ou modifier le statut</label>
        <div className={styles.statusButtons}>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <button
              key={k} type="button"
              className={`${styles.statusOption} ${form.dispersion_status === k ? styles.statusSelected : ''}`}
              onClick={() => set('dispersion_status', k)}
            >
              <span aria-hidden>{v.icon}</span> {v.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className={styles.formError}>{error}</p>}
      <div className={styles.formActions}>
        <button type="submit" className={styles.submitBtn} disabled={saving || !form.dispersion_status}>
          {saving ? 'Enregistrement…' : 'Enregistrer dans le Parking'}
        </button>
        <button type="button" className={styles.cancelBtn} onClick={() => setStep('questions')}>
          ← Retour
        </button>
      </div>
    </form>
  );

  return (
    <form className={styles.form} onSubmit={handleEvaluate}>
      <h3 className={styles.formTitle}>STOP DISPERSION — Nouvelle idée</h3>
      <p className={styles.formHint}>
        Réponds aux 7 questions avant de décider quoi faire de cette idée.
      </p>

      <label className={styles.formField}>
        <span className={styles.formLabel}>Idée *</span>
        <input
          type="text" value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="Décris l'idée en une phrase"
          required minLength={2}
        />
      </label>

      {QUESTIONS.map(q => (
        <label key={q.key} className={styles.formField}>
          <span className={styles.formLabel}>{q.label}</span>
          {q.type === 'bool' ? (
            <div className={styles.boolButtons}>
              <button
                type="button"
                className={`${styles.boolBtn} ${form[q.key] === true ? styles.boolSelected : ''}`}
                onClick={() => set(q.key, true)}
              >Oui</button>
              <button
                type="button"
                className={`${styles.boolBtn} ${form[q.key] === false ? styles.boolSelectedNo : ''}`}
                onClick={() => set(q.key, false)}
              >Non</button>
            </div>
          ) : (
            <input
              type="text" value={form[q.key]}
              onChange={e => set(q.key, e.target.value)}
              placeholder={q.label}
            />
          )}
        </label>
      ))}

      <div className={styles.formActions}>
        <button type="submit" className={styles.submitBtn}>Évaluer →</button>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

function IdeaGroup({ title, ideas, onStatusChange, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (ideas.length === 0) return null;
  return (
    <section className={styles.group}>
      <button className={styles.groupHeader} onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className={styles.groupTitle}>{title}</span>
        <span className={styles.groupCount}>{ideas.length}</span>
        <span aria-hidden>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className={styles.groupList}>
          {ideas.map(idea => (
            <IdeaCard key={idea.id} idea={idea} onStatusChange={onStatusChange} />
          ))}
        </div>
      )}
    </section>
  );
}

export function ParkingPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/parking', { credentials: 'include' });
      if (!r.ok) throw new Error('Erreur chargement');
      setData(await r.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingState />;
  if (error)   return <ErrorState message={error} onRetry={load} />;

  const { grouped = {} } = data ?? {};

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.header}>
        <div>
          <h1 className={pageStyles.title}>Parking à Idées</h1>
          <p className={styles.subtitle}>STOP DISPERSION — chaque idée passe par les 7 questions.</p>
        </div>
        {!showForm && (
          <button className={styles.newBtn} onClick={() => setShowForm(true)}>
            + Nouvelle idée
          </button>
        )}
      </div>

      {showForm && (
        <NewIdeaForm
          onCreated={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <IdeaGroup
        title="Agir maintenant"
        ideas={grouped.agir_maintenant ?? []}
        onStatusChange={load}
        defaultOpen
      />
      <IdeaGroup
        title="Tester plus tard"
        ideas={grouped.tester_plus_tard ?? []}
        onStatusChange={load}
        defaultOpen
      />
      <IdeaGroup
        title="Parking"
        ideas={grouped.parking ?? []}
        onStatusChange={load}
        defaultOpen={!grouped.agir_maintenant?.length}
      />
      <IdeaGroup
        title="Abandonner"
        ideas={grouped.abandonner ?? []}
        onStatusChange={load}
      />

      {data?.total === 0 && !showForm && (
        <div className={styles.empty}>
          <p>Aucune idée en parking.</p>
          <p>La prochaine fois qu'une idée s'impose à toi, passe-la par les 7 questions avant d'agir.</p>
        </div>
      )}
    </div>
  );
}
