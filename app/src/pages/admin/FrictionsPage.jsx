import { useState, useEffect, useCallback } from 'react';
import { LoadingState } from '../../components/states/LoadingState';
import { ErrorState } from '../../components/states/ErrorState';
import styles from './AdminPage.module.css';
import frStyles from './FrictionsPage.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

const CATEGORY_LABELS = {
  comprehension: 'Compréhension',
  navigation:    'Navigation',
  technique:     'Technique',
  instruction:   'Instruction',
  surcharge:     'Surcharge',
  ia:            'IA / COPILOTE',
  gate:          'Porte',
  support:       'Support',
  marche:        'Mon Marché',
};

const SEVERITY_COLORS = { ROUGE: '#dc2626', ORANGE: '#d97706', VERT: '#16a34a' };
const STATUS_LABELS    = { open: 'Ouvert', in_progress: 'En cours', resolved: 'Résolu' };
const DECISIONS        = ['GARDER', 'AJUSTER', 'SUPPRIMER', 'OBSERVER'];

function useFrictions(filter) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.severity) params.set('severity', filter.severity);
    if (filter.status)   params.set('status',   filter.status);
    fetch(`${API}/api/frictions/admin?${params}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject('Erreur'))
      .then(setData)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [filter.severity, filter.status]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

function ReviewPanel({ friction, onUpdated }) {
  const [form, setForm] = useState({
    decision: friction.admin_decision ?? '',
    admin_response: friction.admin_response ?? '',
    status: friction.status,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async e => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const body = {};
      if (form.decision)        body.decision = form.decision;
      if (form.admin_response !== friction.admin_response) body.admin_response = form.admin_response;
      if (form.status !== friction.status)                 body.status = form.status;
      const r = await fetch(`${API}/api/frictions/admin/${friction.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const res = await r.json();
      if (!r.ok) throw new Error(res.error ?? 'Erreur');
      onUpdated(res);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className={frStyles.reviewForm}>
      <div className={frStyles.reviewField}>
        <label className={frStyles.reviewLabel}>Décision</label>
        <div className={frStyles.decisionBtns}>
          {DECISIONS.map(d => (
            <button type="button" key={d}
              className={`${frStyles.decisionBtn} ${form.decision === d ? frStyles.decisionActive : ''}`}
              onClick={() => set('decision', form.decision === d ? '' : d)}
            >{d}</button>
          ))}
        </div>
      </div>

      <div className={frStyles.reviewField}>
        <label className={frStyles.reviewLabel}>Statut</label>
        <select value={form.status} onChange={e => set('status', e.target.value)} className={frStyles.select}>
          <option value="open">Ouvert</option>
          <option value="in_progress">En cours</option>
          <option value="resolved">Résolu</option>
        </select>
      </div>

      <div className={frStyles.reviewField}>
        <label className={frStyles.reviewLabel}>Réponse admin (optionnel)</label>
        <textarea
          rows={2} value={form.admin_response}
          onChange={e => set('admin_response', e.target.value)}
          className={frStyles.textarea}
          placeholder="Réponse visible par la participante si implémenté"
        />
      </div>

      {err && <p className={frStyles.err}>{err}</p>}

      <button type="submit" className={frStyles.saveBtn} disabled={saving}>
        {saving ? 'Envoi…' : 'Enregistrer'}
      </button>
    </form>
  );
}

function FrictionRow({ friction, onUpdated }) {
  const [open, setOpen] = useState(false);
  const sev = friction.severity;

  return (
    <div className={frStyles.row}>
      <button className={frStyles.rowHead} onClick={() => setOpen(o => !o)}>
        <span className={frStyles.severityDot} style={{ background: SEVERITY_COLORS[sev] }} />
        <span className={frStyles.rowName}>{friction.first_name}</span>
        <span className={frStyles.categoryBadge}>{CATEGORY_LABELS[friction.category] ?? friction.category}</span>
        <span className={frStyles.statusBadge}
          data-status={friction.status}
        >{STATUS_LABELS[friction.status]}</span>
        <span className={frStyles.rowDate}>{friction.reported_at?.slice(0, 10)}</span>
        <span className={frStyles.chevron}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className={frStyles.rowBody}>
          <p className={frStyles.frictionText}>{friction.friction}</p>
          {friction.admin_decision && (
            <p className={frStyles.existingDecision}>Décision actuelle : <strong>{friction.admin_decision}</strong></p>
          )}
          {friction.admin_response && (
            <p className={frStyles.existingResponse}>Réponse : {friction.admin_response}</p>
          )}
          <ReviewPanel friction={friction} onUpdated={updated => { onUpdated(updated); setOpen(false); }} />
        </div>
      )}
    </div>
  );
}

export function FrictionsPage() {
  const [filter, setFilter] = useState({ severity: '', status: 'open' });
  const { data, loading, error, reload } = useFrictions(filter);
  const [items, setItems] = useState(null);

  useEffect(() => { if (data) setItems(data); }, [data]);

  const handleUpdated = updated => {
    setItems(prev => prev.map(f => f.id === updated.id ? { ...f, ...updated } : f));
    reload();
  };

  if (loading && !items) return <LoadingState label="Chargement des signalements…" />;
  if (error && !items) return <ErrorState title="Erreur" message={error} onRetry={reload} />;

  const list = items ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Frictions signalées</h1>
        <p className={styles.subtitle}>{list.length} signalement{list.length !== 1 ? 's' : ''}</p>
      </div>

      <div className={frStyles.filters}>
        <select value={filter.severity} onChange={e => setFilter(f => ({ ...f, severity: e.target.value }))} className={frStyles.filterSelect}>
          <option value="">Toutes sévérités</option>
          <option value="ROUGE">ROUGE</option>
          <option value="ORANGE">ORANGE</option>
          <option value="VERT">VERT</option>
        </select>
        <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} className={frStyles.filterSelect}>
          <option value="">Tous statuts</option>
          <option value="open">Ouvert</option>
          <option value="in_progress">En cours</option>
          <option value="resolved">Résolu</option>
        </select>
      </div>

      <div className={frStyles.list}>
        {list.map(f => (
          <FrictionRow key={f.id} friction={f} onUpdated={handleUpdated} />
        ))}
        {list.length === 0 && (
          <p className={frStyles.empty}>Aucun signalement pour ces filtres.</p>
        )}
      </div>
    </div>
  );
}
