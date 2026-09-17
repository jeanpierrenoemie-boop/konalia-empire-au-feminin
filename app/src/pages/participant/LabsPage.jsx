import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { LoadingState } from '../../components/states/LoadingState';
import { ErrorState } from '../../components/states/ErrorState';
import styles from './LabsPage.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

function useLabs() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/labs`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject('Erreur de chargement'))
      .then(setData)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  });
}

function PreLabForm({ lab, existing, onSaved }) {
  const [form, setForm] = useState({
    progress_since_last: existing?.progress_since_last ?? '',
    planned_mission: existing?.planned_mission ?? '',
    deliverable: existing?.deliverable ?? '',
    deliverable_status: existing?.deliverable_status ?? '',
    decision_taken: existing?.decision_taken ?? '',
    current_blocker: existing?.current_blocker ?? '',
    priority_question: existing?.priority_question ?? '',
    key_point: existing?.key_point ?? '',
    useful_to_group: existing?.useful_to_group ?? null,
    authorise_case_use: existing?.authorise_case_use ?? null,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async e => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`${API}/api/labs/${lab.id}/prelab`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? 'Erreur');
      setSaved(true);
      onSaved(body);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.prelabForm} onSubmit={submit}>
      <h3 className={styles.prelabTitle}>Prépare ton Lab</h3>

      <label className={styles.field}>
        <span>Depuis le dernier Lab, j'ai avancé sur…</span>
        <textarea rows={2} value={form.progress_since_last} onChange={e => set('progress_since_last', e.target.value)} />
      </label>

      <label className={styles.field}>
        <span>Mission prévue pour ce Lab</span>
        <textarea rows={2} value={form.planned_mission} onChange={e => set('planned_mission', e.target.value)} />
      </label>

      <label className={styles.field}>
        <span>Livrable / réponse que tu vas tester</span>
        <textarea rows={2} value={form.deliverable} onChange={e => set('deliverable', e.target.value)} />
      </label>

      <label className={styles.field}>
        <span>Statut du livrable</span>
        <select value={form.deliverable_status} onChange={e => set('deliverable_status', e.target.value)}>
          <option value="">—</option>
          <option value="termine">Terminé</option>
          <option value="en_cours">En cours</option>
          <option value="bloque">Bloqué</option>
        </select>
      </label>

      <label className={styles.field}>
        <span>Décision prise depuis le dernier Lab</span>
        <textarea rows={2} value={form.decision_taken} onChange={e => set('decision_taken', e.target.value)} />
      </label>

      <label className={styles.field}>
        <span>Blocage actuel</span>
        <textarea rows={2} value={form.current_blocker} onChange={e => set('current_blocker', e.target.value)} />
      </label>

      <label className={styles.field}>
        <span className={styles.required}>Question prioritaire *</span>
        <textarea
          rows={2} required
          value={form.priority_question}
          onChange={e => set('priority_question', e.target.value)}
          placeholder="La question que tu veux absolument traiter"
        />
      </label>

      <label className={styles.field}>
        <span>Si Noémie ne devait traiter qu'un seul point…</span>
        <textarea rows={2} value={form.key_point} onChange={e => set('key_point', e.target.value)} />
      </label>

      <div className={styles.boolRow}>
        <span>Utile au groupe ?</span>
        <div className={styles.boolButtons}>
          {[1, 0].map(v => (
            <button type="button" key={v}
              className={`${styles.boolBtn} ${form.useful_to_group === v ? styles.boolBtnActive : ''}`}
              onClick={() => set('useful_to_group', form.useful_to_group === v ? null : v)}
            >{v ? 'Oui' : 'Non'}</button>
          ))}
        </div>
      </div>

      <div className={styles.boolRow}>
        <span>Autorisation d'utiliser le cas ?</span>
        <div className={styles.boolButtons}>
          {[1, 0].map(v => (
            <button type="button" key={v}
              className={`${styles.boolBtn} ${form.authorise_case_use === v ? styles.boolBtnActive : ''}`}
              onClick={() => set('authorise_case_use', form.authorise_case_use === v ? null : v)}
            >{v ? 'Oui' : 'Non'}</button>
          ))}
        </div>
      </div>

      {err && <p className={styles.err}>{err}</p>}
      {saved && <p className={styles.ok}>Soumission enregistrée ✓</p>}

      <button type="submit" className={styles.submitBtn} disabled={saving}>
        {saving ? 'Envoi…' : existing ? 'Mettre à jour' : 'Soumettre'}
      </button>
    </form>
  );
}

function NextLabCard({ lab, onSaved }) {
  const [showForm, setShowForm] = useState(!lab.prelab_submitted);
  const [prelab, setPrelab] = useState(lab.user_prelab ?? null);
  const hoursUntil = lab.hours_until ?? null;
  const isLate = hoursUntil !== null && hoursUntil < 24 && hoursUntil > 0;

  const handleSaved = body => {
    setPrelab(body.prelab);
    onSaved?.();
  };

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.badge}>Prochain Lab</span>
        {isLate && (
          <span className={styles.lateWarning}>⚠ Soumission tardive — intégration non garantie</span>
        )}
      </div>
      <h2 className={styles.labTitle}>{lab.title}</h2>
      {lab.topic && <p className={styles.labTopic}>{lab.topic}</p>}
      <p className={styles.labDate}>{formatDate(lab.scheduled_at)}</p>

      {prelab ? (
        <div className={styles.prelabDone}>
          <p className={styles.prelabDoneMsg}>✓ Pré-Lab soumis</p>
          <p className={styles.prelabQuestion}>« {prelab.priority_question} »</p>
          <button className={styles.editBtn} onClick={() => setShowForm(s => !s)}>
            {showForm ? 'Masquer' : 'Modifier'}
          </button>
        </div>
      ) : null}

      {showForm && (
        <PreLabForm lab={lab} existing={prelab} onSaved={handleSaved} />
      )}

      {!prelab && !showForm && (
        <button className={styles.submitBtn} onClick={() => setShowForm(true)}>
          Préparer mon Lab
        </button>
      )}
    </section>
  );
}

function AccessibleLabCard({ lab }) {
  const [open, setOpen] = useState(false);
  const resources = lab.resources ? (typeof lab.resources === 'string' ? JSON.parse(lab.resources) : lab.resources) : [];

  return (
    <div className={styles.pastLab}>
      <button className={styles.pastLabToggle} onClick={() => setOpen(o => !o)}>
        <span className={styles.pastLabTitle}>{lab.title}</span>
        <span className={styles.pastLabDate}>{formatDate(lab.scheduled_at)}</span>
        <span className={styles.chevron}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className={styles.pastLabContent}>
          {lab.replay_url && (
            <a href={lab.replay_url} target="_blank" rel="noreferrer" className={styles.replayLink}>
              ▶ Voir le replay
            </a>
          )}
          {resources.length > 0 && (
            <ul className={styles.resources}>
              {resources.map((r, i) => (
                <li key={i}><a href={r.url} target="_blank" rel="noreferrer">{r.label}</a></li>
              ))}
            </ul>
          )}
          {!lab.replay_url && resources.length === 0 && (
            <p className={styles.noContent}>Aucune ressource disponible pour ce Lab.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function LabsPage() {
  const { data, loading, error, reload } = useLabs();

  if (loading) return <LoadingState label="Chargement des Labs…" />;
  if (error) return <ErrorState title="Erreur de chargement" message={error} onRetry={reload} />;

  const { next_lab, accessible_labs } = data ?? {};

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Mes Labs</h1>
      </div>

      {next_lab ? (
        <NextLabCard lab={next_lab} onSaved={reload} />
      ) : (
        <section className={styles.card}>
          <p className={styles.empty}>Aucun Lab à venir pour le moment.</p>
        </section>
      )}

      {accessible_labs?.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Labs passés</h2>
          <div className={styles.pastLabsList}>
            {accessible_labs.map(lab => <AccessibleLabCard key={lab.id} lab={lab} />)}
          </div>
        </section>
      )}
    </div>
  );
}
