import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoadingState } from '../../../components/states/LoadingState';
import { ErrorState } from '../../../components/states/ErrorState';
import styles from './FicheConversation.module.css';
import pageStyles from '../Page.module.css';

const SIGNAL_LEVELS = [
  { key: 'politesse',             label: '1. Politesse',             color: '#9ca3af', desc: '"C\'est bien ce que tu fais" — ne valide rien.' },
  { key: 'probleme_exprime',      label: '2. Problème exprimé',      color: '#f59e0b', desc: 'La personne nomme un problème réel qu\'elle ressent.' },
  { key: 'comportement_passe',    label: '3. Comportement passé',    color: '#f97316', desc: 'Elle a déjà agi en lien avec ce problème (payé, cherché, contourné).' },
  { key: 'interet_solution',      label: '4. Intérêt pour la solution', color: '#3b82f6', desc: 'Elle exprime de l\'intérêt pour cette solution spécifique.' },
  { key: 'intention_commerciale', label: '5. Intention commerciale', color: '#8b5cf6', desc: 'Elle manifeste une intention d\'achat ou de collaboration concrète.' },
  { key: 'engagement',            label: '6. Engagement',            color: '#10b981', desc: 'Elle prend un engagement concret (rdv, acompte, recommandation active).' },
];

function SignalChip({ type, strength }) {
  const cfg = SIGNAL_LEVELS.find(l => l.key === type) ?? { label: type, color: '#9ca3af' };
  const bars = Array.from({ length: 3 }, (_, i) => i < strength);
  return (
    <span className={styles.signalChip} style={{ borderColor: cfg.color }}>
      <span className={styles.signalLabel} style={{ color: cfg.color }}>{cfg.label}</span>
      <span className={styles.strength}>
        {bars.map((on, i) => (
          <span key={i} className={styles.bar} style={{ background: on ? cfg.color : 'var(--f-border)' }} />
        ))}
      </span>
    </span>
  );
}

function AddSignalForm({ convId, onAdded }) {
  const [type, setType] = useState('');
  const [content, setContent] = useState('');
  const [strength, setStrength] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!type) { setError('Choisissez un type de signal.'); return; }
    if (!content.trim()) { setError('Le contenu est requis.'); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/marche/signals', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: convId, signal_type: type, content, strength }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? 'Erreur'); }
      const sig = await r.json();
      onAdded(sig);
      setType(''); setContent(''); setStrength(2); setError(null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <form className={styles.addForm} onSubmit={handleSubmit}>
      <h3 className={styles.addFormTitle}>Ajouter un signal</h3>
      {error && <p className={styles.formError}>{error}</p>}
      <div className={styles.field}>
        <label>Type de signal</label>
        <select value={type} onChange={e => setType(e.target.value)} required>
          <option value="">— choisir le niveau —</option>
          {SIGNAL_LEVELS.map(l => (
            <option key={l.key} value={l.key}>{l.label}</option>
          ))}
        </select>
        {type && (
          <p className={styles.typeHint}>
            {SIGNAL_LEVELS.find(l => l.key === type)?.desc}
          </p>
        )}
      </div>
      <div className={styles.field}>
        <label>Ce qui a été dit / observé</label>
        <textarea rows={3} value={content} onChange={e => setContent(e.target.value)}
          placeholder="Citation ou description précise…" required />
      </div>
      <div className={styles.field}>
        <label>Force (1 = faible, 3 = fort)</label>
        <div className={styles.strengthRow}>
          {[1, 2, 3].map(v => (
            <button key={v} type="button"
              className={strength === v ? styles.strengthActive : styles.strengthBtn}
              onClick={() => setStrength(v)}>{v}</button>
          ))}
        </div>
      </div>
      <button type="submit" className={styles.btnPrimary} disabled={loading}>
        {loading ? 'Enregistrement…' : 'Enregistrer le signal'}
      </button>
    </form>
  );
}

export function FicheConversation() {
  const { contactId, convId } = useParams();
  const [conv, setConv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/marche/conversations/${convId}`, { credentials: 'include' });
      if (!r.ok) throw new Error('Conversation introuvable');
      setConv(await r.json());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [convId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingState />;
  if (error)   return <ErrorState message={error} />;
  if (!conv)   return null;

  return (
    <div className={pageStyles.page}>
      <div className={styles.breadcrumb}>
        <Link to="/marche">Mon Marché</Link> /
        <Link to={`/marche/${contactId}`}> Contact</Link> /
        {' Conversation'}
      </div>

      <div className={styles.header}>
        <h1 className={styles.title}>{conv.title}</h1>
        <span className={styles.date}>{conv.date_occurred}</span>
      </div>

      <div className={styles.summaryBox}>
        <p className={styles.summaryLabel}>Résumé</p>
        <p className={styles.summaryText}>{conv.summary}</p>
      </div>

      <div className={styles.integrityNote}>
        <strong>Rappel :</strong> Politesse ≠ Intérêt ≠ Engagement.<br />
        Un intérêt poli ne constitue pas une demande validée.
      </div>

      <div className={styles.hierarchyRef}>
        <p className={styles.refTitle}>Hiérarchie des signaux</p>
        <ol className={styles.refList}>
          {SIGNAL_LEVELS.map(l => (
            <li key={l.key} className={styles.refItem}>
              <span className={styles.refDot} style={{ background: l.color }} />
              <span className={styles.refLabel}>{l.label}</span>
              <span className={styles.refDesc}>{l.desc}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.signals}>
        <h2 className={styles.signalTitle}>Signaux ({conv.signals?.length ?? 0})</h2>
        {(conv.signals ?? []).length === 0 ? (
          <p className={styles.empty}>Aucun signal enregistré pour cette conversation.</p>
        ) : (
          <ul className={styles.signalList}>
            {conv.signals.map(s => (
              <li key={s.id} className={styles.signalItem}>
                <SignalChip type={s.signal_type} strength={s.strength} />
                <p className={styles.signalContent}>{s.content}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AddSignalForm convId={convId} onAdded={s => setConv(c => ({ ...c, signals: [...(c.signals ?? []), s] }))} />
    </div>
  );
}
