import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LoadingState } from '../../../components/states/LoadingState';
import { ErrorState } from '../../../components/states/ErrorState';
import styles from './ContactPage.module.css';
import pageStyles from '../Page.module.css';

const STATUS_CONFIG = {
  prospect:  { label: 'Prospect',  color: '#6b7280' },
  en_cours:  { label: 'En cours',  color: '#3b82f6' },
  converti:  { label: 'Converti',  color: '#10b981' },
  pause:     { label: 'Pause',     color: '#f59e0b' },
  abandonne: { label: 'Abandonné', color: '#ef4444' },
};

const CEILING_CONFIG = {
  politesse:             { label: 'Politesse',             color: '#9ca3af', desc: 'Intérêt poli — ne confirme rien.' },
  probleme_exprime:      { label: 'Problème exprimé',      color: '#f59e0b', desc: 'Un problème réel a été nommé.' },
  comportement_passe:    { label: 'Comportement passé',    color: '#f97316', desc: 'Un comportement passé corrobore le problème.' },
  interet_solution:      { label: 'Intérêt pour la solution', color: '#3b82f6', desc: 'De l\'intérêt pour cette solution spécifique.' },
  intention_commerciale: { label: 'Intention commerciale', color: '#8b5cf6', desc: 'Une intention d\'achat a été observée explicitement.' },
  engagement:            { label: 'Engagement',            color: '#10b981', desc: 'Un engagement concret a été pris.' },
};

const CIRCLE_LABELS = {
  proche: 'Proche', connaissance: 'Connaissance',
  inconnu: 'Inconnu', prescripteur: 'Prescripteur', autre: 'Autre',
};

function EditableField({ label, value, onSave, multiline = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  async function handleSave() {
    await onSave(draft);
    setEditing(false);
  }

  return (
    <div className={styles.editableField}>
      <span className={styles.editableLabel}>{label}</span>
      {editing ? (
        <div className={styles.editableEdit}>
          {multiline
            ? <textarea rows={3} value={draft} onChange={e => setDraft(e.target.value)} />
            : <input value={draft} onChange={e => setDraft(e.target.value)} />
          }
          <div className={styles.editableActions}>
            <button onClick={handleSave} className={styles.btnSm}>Enregistrer</button>
            <button onClick={() => { setDraft(value ?? ''); setEditing(false); }} className={styles.btnSmSec}>Annuler</button>
          </div>
        </div>
      ) : (
        <div className={styles.editableValue} onClick={() => setEditing(true)}>
          {value ? <span>{value}</span> : <span className={styles.emptyVal}>Cliquer pour renseigner…</span>}
          <span className={styles.editIcon}>✎</span>
        </div>
      )}
    </div>
  );
}

function NewConvForm({ contactId, onCreated, onCancel }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!summary.trim()) { setError('Le résumé est requis.'); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/marche/conversations', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, date, summary }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? 'Erreur'); }
      onCreated(await r.json());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <form className={styles.newForm} onSubmit={handleSubmit}>
      <h3>Nouvelle conversation</h3>
      {error && <p className={styles.formError}>{error}</p>}
      <div className={styles.field}>
        <label>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} required />
      </div>
      <div className={styles.field}>
        <label>Résumé *</label>
        <textarea rows={3} value={summary} onChange={e => setSummary(e.target.value)}
          placeholder="Ce qui s'est passé, ce qui a été dit…" required />
      </div>
      <div className={styles.formActions}>
        <button type="submit" className={styles.btnPrimary} disabled={loading}>
          {loading ? 'Création…' : 'Créer'}
        </button>
        <button type="button" className={styles.btnSecondary} onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

export function ContactPage() {
  const { contactId } = useParams();
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewConv, setShowNewConv] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/marche/contacts/${contactId}`, { credentials: 'include' });
      if (!r.ok) throw new Error('Contact introuvable');
      setContact(await r.json());
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  async function updateField(field, value) {
    const r = await fetch(`/api/marche/contacts/${contactId}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    if (r.ok) setContact(c => ({ ...c, [field]: value }));
  }

  if (loading) return <LoadingState />;
  if (error)   return <ErrorState message={error} />;
  if (!contact) return null;

  const statusCfg  = STATUS_CONFIG[contact.status] ?? STATUS_CONFIG.prospect;
  const ceilingCfg = contact.signal_ceiling ? CEILING_CONFIG[contact.signal_ceiling] : null;

  return (
    <div className={pageStyles.page}>
      <div className={styles.breadcrumb}>
        <Link to="/marche">Mon Marché</Link> / {contact.name}
      </div>

      <div className={styles.header}>
        <div>
          <h1 className={styles.name}>{contact.name}</h1>
          <div className={styles.chips}>
            <span className={styles.statusChip} style={{ background: statusCfg.color }}>{statusCfg.label}</span>
            {contact.circle && <span className={styles.circleChip}>{CIRCLE_LABELS[contact.circle] ?? contact.circle}</span>}
          </div>
        </div>
        {ceilingCfg && (
          <div className={styles.ceilingBadge} style={{ borderColor: ceilingCfg.color }}>
            <div className={styles.ceilingLabel} style={{ color: ceilingCfg.color }}>{ceilingCfg.label}</div>
            <div className={styles.ceilingDesc}>{ceilingCfg.desc}</div>
          </div>
        )}
      </div>

      {contact.commercial_intent && (
        <div className={styles.intentBanner}>
          Intention commerciale : <strong>{contact.commercial_intent}</strong> — observée explicitement.
        </div>
      )}

      <div className={styles.fields}>
        <EditableField label="Prochaine action" value={contact.next_action}
          onSave={v => updateField('next_action', v)} />
        <EditableField label="Dernière action" value={contact.last_action}
          onSave={v => updateField('last_action', v)} />
        <EditableField label="Dernière date de contact" value={contact.last_contact_date}
          onSave={v => updateField('last_contact_date', v)} />
        <EditableField label="Notes" value={contact.notes}
          onSave={v => updateField('notes', v)} multiline />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Conversations ({contact.conversations?.length ?? 0})</h2>
          <button className={styles.btnPrimary} onClick={() => setShowNewConv(true)}>
            + Nouvelle conversation
          </button>
        </div>

        {showNewConv && (
          <NewConvForm
            contactId={contactId}
            onCreated={c => { setContact(prev => ({ ...prev, conversations: [c, ...(prev.conversations ?? [])] })); setShowNewConv(false); }}
            onCancel={() => setShowNewConv(false)}
          />
        )}

        {(contact.conversations ?? []).length === 0 ? (
          <p className={styles.empty}>Aucune conversation enregistrée.</p>
        ) : (
          <ul className={styles.convList}>
            {contact.conversations.map(c => (
              <li key={c.id}>
                <Link to={`/marche/${contactId}/conversation/${c.id}`} className={styles.convCard}>
                  <span className={styles.convDate}>{c.date_occurred}</span>
                  <span className={styles.convSummary}>{c.summary}</span>
                  {c.signal_count > 0 && (
                    <span className={styles.signalCount}>{c.signal_count} signal{c.signal_count !== 1 ? 's' : ''}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
