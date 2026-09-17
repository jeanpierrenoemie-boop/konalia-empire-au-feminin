import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { LoadingState } from '../../components/states/LoadingState';
import { ErrorState } from '../../components/states/ErrorState';
import styles from './DecisionsPage.module.css';
import pageStyles from './Page.module.css';

const TYPE_LABELS = {
  project: 'Projet', pivot: 'Pivot', persona: 'Persona',
  revenue: 'Revenus', go_nogo: 'Go / No-Go', scope: 'Périmètre', other: 'Autre',
};

const TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }));

function DecisionCard({ decision, onSupersede }) {
  const [expanded, setExpanded] = useState(false);
  const isActive = decision.status === 'active';

  return (
    <div className={`${styles.card} ${isActive ? styles.active : styles.historical}`}>
      <div className={styles.cardHeader}>
        <span className={styles.typeTag}>{TYPE_LABELS[decision.decision_type] ?? decision.decision_type}</span>
        <span className={`${styles.statusBadge} ${styles[`status_${decision.status}`]}`}>
          {decision.status === 'active' ? 'Active' : decision.status === 'superseded' ? 'Remplacée' : 'Archivée'}
        </span>
        <span className={styles.date}>{formatDate(decision.created_at)}</span>
        <button className={styles.expandBtn} onClick={() => setExpanded(e => !e)} aria-expanded={expanded}>
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      <h3 className={styles.cardTitle}>{decision.title}</h3>

      {expanded && (
        <div className={styles.cardBody}>
          {decision.rationale && (
            <div className={styles.cardField}>
              <span className={styles.fieldLabel}>Raison</span>
              <p>{decision.rationale}</p>
            </div>
          )}
          {decision.facts_used && (
            <div className={styles.cardField}>
              <span className={styles.fieldLabel}>Faits utilisés</span>
              <p>{decision.facts_used}</p>
            </div>
          )}
          {decision.hypotheses && (
            <div className={styles.cardField}>
              <span className={styles.fieldLabel}>Hypothèses</span>
              <p>{decision.hypotheses}</p>
            </div>
          )}
          {decision.reopening_condition && (
            <div className={styles.cardField}>
              <span className={styles.fieldLabel}>Condition de réouverture</span>
              <p className={styles.reopening}>{decision.reopening_condition}</p>
            </div>
          )}
          {decision.supersedes_title && (
            <div className={styles.cardField}>
              <span className={styles.fieldLabel}>Remplace</span>
              <p className={styles.supersedes}>« {decision.supersedes_title} »</p>
            </div>
          )}
          {decision.superseded_by_title && (
            <div className={styles.cardField}>
              <span className={styles.fieldLabel}>Remplacée par</span>
              <p className={styles.supersededBy}>« {decision.superseded_by_title} »</p>
            </div>
          )}
          {isActive && (
            <button className={styles.supersedeBtn} onClick={() => onSupersede(decision)}>
              Remplacer cette décision →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NewDecisionForm({ onCreated, onCancel, superseding = null }) {
  const [form, setForm] = useState({
    decision_type: superseding?.decision_type ?? '',
    title: '',
    rationale: '',
    facts_used: '',
    hypotheses: '',
    reopening_condition: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const url = superseding
        ? `/api/decisions/${superseding.id}/supersede`
        : '/api/decisions';
      const r = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await r.json();
      if (!r.ok) { setError(body.error ?? 'Erreur'); return; }
      onCreated(superseding ? body.new : body);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <h3 className={styles.formTitle}>
        {superseding ? `Remplacer : « ${superseding.title} »` : 'Nouvelle décision'}
      </h3>

      {!superseding && (
        <label className={styles.formField}>
          <span className={styles.formLabel}>Type *</span>
          <select value={form.decision_type} onChange={e => set('decision_type', e.target.value)} required>
            <option value="">— choisir —</option>
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      )}

      <label className={styles.formField}>
        <span className={styles.formLabel}>Décision *</span>
        <input
          type="text" value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="Formule claire et actionnable"
          required minLength={3}
        />
      </label>

      <label className={styles.formField}>
        <span className={styles.formLabel}>Raison {superseding ? '*' : ''}</span>
        <textarea
          value={form.rationale}
          onChange={e => set('rationale', e.target.value)}
          placeholder={superseding ? 'Pourquoi cette décision remplace la précédente (min 10 caractères)' : 'Pourquoi cette décision'}
          rows={3}
          {...(superseding ? { required: true, minLength: 10 } : {})}
        />
      </label>

      <label className={styles.formField}>
        <span className={styles.formLabel}>Faits utilisés</span>
        <textarea
          value={form.facts_used}
          onChange={e => set('facts_used', e.target.value)}
          placeholder="Données concrètes, observations, conversations qui justifient cette décision"
          rows={3}
        />
      </label>

      <label className={styles.formField}>
        <span className={styles.formLabel}>Hypothèses</span>
        <textarea
          value={form.hypotheses}
          onChange={e => set('hypotheses', e.target.value)}
          placeholder="Ce que tu assumes vrai mais pas encore prouvé"
          rows={2}
        />
      </label>

      <label className={styles.formField}>
        <span className={styles.formLabel}>Condition de réouverture</span>
        <input
          type="text" value={form.reopening_condition}
          onChange={e => set('reopening_condition', e.target.value)}
          placeholder="Qu'est-ce qui t'amènerait à remettre cette décision en question ?"
        />
      </label>

      {error && <p className={styles.formError}>{error}</p>}

      <div className={styles.formActions}>
        <button type="submit" className={styles.submitBtn} disabled={saving}>
          {saving ? 'Enregistrement…' : superseding ? 'Enregistrer le remplacement' : 'Enregistrer la décision'}
        </button>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DecisionsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [superseding, setSuperseding] = useState(null);

  const load = useCallback(async function () {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/decisions', { credentials: 'include' });
      if (!r.ok) throw new Error('Erreur chargement');
      setData(await r.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSupersede(decision) {
    setSuperseding(decision);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleCreated() {
    setShowForm(false);
    setSuperseding(null);
    load();
  }

  if (loading) return <LoadingState />;
  if (error)   return <ErrorState message={error} onRetry={load} />;

  const { active = [], historical = [] } = data ?? {};

  return (
    <div className={pageStyles.page}>
      <div className={pageStyles.header}>
        <h1 className={pageStyles.title}>Journal des Décisions</h1>
        <Link to="/passeport" className={styles.backLink}>← Passeport</Link>
      </div>

      <p className={styles.principle}>
        Une décision validée reste active jusqu'à ce qu'elle soit explicitement remplacée avec une raison et de nouvelles preuves.
      </p>

      {(showForm || superseding) ? (
        <NewDecisionForm
          superseding={superseding}
          onCreated={handleCreated}
          onCancel={() => { setShowForm(false); setSuperseding(null); }}
        />
      ) : (
        <button className={styles.newBtn} onClick={() => setShowForm(true)}>
          + Enregistrer une décision
        </button>
      )}

      {active.length > 0 && (
        <section>
          <h2 className={styles.groupTitle}>Décisions actives ({active.length})</h2>
          <div className={styles.cardList}>
            {active.map(d => (
              <DecisionCard key={d.id} decision={d} onSupersede={handleSupersede} />
            ))}
          </div>
        </section>
      )}

      {active.length === 0 && !showForm && (
        <div className={styles.empty}>
          Aucune décision stratégique enregistrée. Commence par documenter ta direction.
        </div>
      )}

      {historical.length > 0 && (
        <section>
          <h2 className={styles.groupTitle}>Historique ({historical.length})</h2>
          <div className={styles.cardList}>
            {historical.map(d => (
              <DecisionCard key={d.id} decision={d} onSupersede={() => {}} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
