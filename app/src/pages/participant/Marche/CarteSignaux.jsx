import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { LoadingState } from '../../../components/states/LoadingState';
import { ErrorState } from '../../../components/states/ErrorState';
import styles from './CarteSignaux.module.css';
import pageStyles from '../Page.module.css';

const SIGNAL_LEVELS = [
  { key: 'politesse',             label: 'Politesse',          color: '#9ca3af' },
  { key: 'probleme_exprime',      label: 'Problème exprimé',   color: '#f59e0b' },
  { key: 'comportement_passe',    label: 'Comportement passé', color: '#f97316' },
  { key: 'interet_solution',      label: 'Intérêt solution',   color: '#3b82f6' },
  { key: 'intention_commerciale', label: 'Intention comm.',    color: '#8b5cf6' },
  { key: 'engagement',            label: 'Engagement',         color: '#10b981' },
];

const STATUS_LABELS = {
  prospect: 'Prospect', en_cours: 'En cours', converti: 'Converti',
  pause: 'Pause', abandonne: 'Abandonné',
};

function CeilingChip({ level }) {
  if (!level) return <span style={{ color: 'var(--cs-muted)', fontSize: '0.75rem' }}>—</span>;
  const cfg = SIGNAL_LEVELS.find(l => l.key === level) ?? { label: level, color: '#9ca3af' };
  return (
    <span className={styles.ceilingChip} style={{ background: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function CountCell({ count, color }) {
  if (!count) return <td className={styles.cell} />;
  const opacity = Math.min(0.2 + count * 0.25, 1);
  return (
    <td className={styles.cell}>
      <span className={styles.cellBadge} style={{ background: color, opacity }}>
        {count}
      </span>
    </td>
  );
}

export function CarteSignaux() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/marche/carte', { credentials: 'include' });
      if (!r.ok) throw new Error('Erreur réseau');
      setData(await r.json());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingState />;
  if (error)   return <ErrorState message={error} onRetry={load} />;
  if (!data)   return null;

  const { contacts, signal_matrix, summary } = data;

  return (
    <div className={pageStyles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>
            <Link to="/marche">Mon Marché</Link> / Carte des signaux
          </div>
          <h1 className={styles.title}>Carte des signaux</h1>
        </div>
      </div>

      <div className={styles.summaryRow}>
        <div className={styles.stat}>
          <span className={styles.statNum}>{summary.total_contacts}</span>
          <span className={styles.statLabel}>contacts</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>{summary.with_expressed_problem}</span>
          <span className={styles.statLabel}>ont exprimé un problème</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>{summary.with_commercial_intent}</span>
          <span className={styles.statLabel}>ont démontré une intention commerciale</span>
        </div>
      </div>

      <div className={styles.integrityNote}>
        La carte reflète les signaux réels enregistrés.<br />
        Un contact sans signal d&apos;engagement ou d&apos;intention commerciale explicite
        n&apos;a pas de demande validée, quelle que soit son apparente sympathie.
      </div>

      {contacts.length === 0 ? (
        <p className={styles.empty}>Aucun contact. <Link to="/marche">Ajouter des contacts</Link>.</p>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thContact}>Contact</th>
                <th className={styles.thCeiling}>Niveau max</th>
                {SIGNAL_LEVELS.map(l => (
                  <th key={l.key} className={styles.th} style={{ color: l.color }}>{l.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => {
                const matrix = signal_matrix[c.id] ?? {};
                return (
                  <tr key={c.id}>
                    <td className={styles.tdContact}>
                      <Link to={`/marche/${c.id}`} className={styles.contactLink}>{c.name}</Link>
                      <span className={styles.statusTag}>{STATUS_LABELS[c.status] ?? c.status}</span>
                    </td>
                    <td className={styles.tdCeiling}>
                      <CeilingChip level={c.signal_ceiling} />
                    </td>
                    {SIGNAL_LEVELS.map(l => (
                      <CountCell key={l.key} count={matrix[l.key] ?? 0} color={l.color} />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.legend}>
        <p className={styles.legendTitle}>Niveaux de signal</p>
        <ul className={styles.legendList}>
          {SIGNAL_LEVELS.map(l => (
            <li key={l.key} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: l.color }} />
              {l.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
