import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { LoadingState } from '../../components/states/LoadingState';
import { ErrorState } from '../../components/states/ErrorState';
import styles from './MarchePage.module.css';
import pageStyles from './Page.module.css';

const CIRCLE_LABELS = {
  proche: 'Proche',
  connaissance: 'Connaissance',
  inconnu: 'Inconnu',
  prescripteur: 'Prescripteur',
  autre: 'Autre',
};

const CEILING_CONFIG = {
  politesse:             { label: 'Politesse',            color: '#9ca3af' },
  probleme_exprime:      { label: 'Problème exprimé',     color: '#f59e0b' },
  comportement_passe:    { label: 'Comportement passé',   color: '#f97316' },
  interet_solution:      { label: 'Intérêt solution',     color: '#3b82f6' },
  intention_commerciale: { label: 'Intention commerciale',color: '#8b5cf6' },
  engagement:            { label: 'Engagement',           color: '#10b981' },
};

function CeilingChip({ level }) {
  if (!level) return <span className={styles.ceilingNone}>—</span>;
  const cfg = CEILING_CONFIG[level] ?? { label: level, color: '#9ca3af' };
  return (
    <span className={styles.ceilingChip} style={{ background: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function NewContactForm({ onCreated, onCancel }) {
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [circle, setCircle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Le nom est requis.'); return; }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/marche/contacts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), source: source || undefined, circle: circle || undefined }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? 'Erreur'); }
      const contact = await r.json();
      onCreated(contact);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={styles.newForm} onSubmit={handleSubmit}>
      <h3 className={styles.newFormTitle}>Nouveau contact</h3>
      {error && <p className={styles.formError}>{error}</p>}
      <div className={styles.field}>
        <label>Nom *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Prénom Nom" required />
      </div>
      <div className={styles.field}>
        <label>Source</label>
        <input value={source} onChange={e => setSource(e.target.value)} placeholder="LinkedIn, événement…" />
      </div>
      <div className={styles.field}>
        <label>Cercle</label>
        <select value={circle} onChange={e => setCircle(e.target.value)}>
          <option value="">— choisir —</option>
          {Object.entries(CIRCLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div className={styles.formActions}>
        <button type="submit" className={styles.btnPrimary} disabled={loading}>
          {loading ? 'Création…' : 'Créer le contact'}
        </button>
        <button type="button" className={styles.btnSecondary} onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

export function MarchePage() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [locked, setLocked] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/marche/contacts', { credentials: 'include' });
      if (r.status === 403) { setLocked(true); return; }
      if (!r.ok) throw new Error('Erreur réseau');
      setContacts(await r.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingState />;
  if (locked) return (
    <div className={pageStyles.page}>
      <div className={styles.locked}>
        <div className={styles.lockedIcon}>🔒</div>
        <h2>Mon Marché</h2>
        <p>Disponible à partir de la phase R — Rencontrer</p>
      </div>
    </div>
  );
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className={pageStyles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Mon Marché</h1>
          <p className={styles.subtitle}>{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/marche/carte" className={styles.btnSecondary}>Carte des signaux</Link>
          <button className={styles.btnPrimary} onClick={() => setShowForm(true)}>
            + Nouveau contact
          </button>
        </div>
      </div>

      {showForm && (
        <NewContactForm
          onCreated={c => { setContacts(prev => [c, ...prev]); setShowForm(false); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {contacts.length === 0 ? (
        <div className={styles.empty}>
          <p>Aucun contact pour l&apos;instant.</p>
          <p className={styles.emptyHint}>Ajoutez vos premières personnes rencontrées dans le cadre de votre exploration marché.</p>
        </div>
      ) : (
        <ul className={styles.contactList}>
          {contacts.map(c => (
            <li key={c.id}>
              <Link to={`/marche/${c.id}`} className={styles.contactCard}>
                <div className={styles.contactMain}>
                  <span className={styles.contactName}>{c.name}</span>
                  {c.circle && <span className={styles.circleTag}>{CIRCLE_LABELS[c.circle] ?? c.circle}</span>}
                </div>
                <div className={styles.contactMeta}>
                  <CeilingChip level={c.signal_ceiling} />
                  {c.next_action && (
                    <span className={styles.nextAction}>→ {c.next_action}</span>
                  )}
                  {c.last_contact_date && (
                    <span className={styles.lastDate}>{c.last_contact_date}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
