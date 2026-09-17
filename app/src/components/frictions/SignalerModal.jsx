import { useState } from 'react';
import styles from './SignalerModal.module.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

const CATEGORIES = [
  { value: 'comprehension', label: 'Compréhension' },
  { value: 'navigation',    label: 'Navigation' },
  { value: 'technique',     label: 'Technique' },
  { value: 'instruction',   label: 'Instruction' },
  { value: 'surcharge',     label: 'Surcharge' },
  { value: 'ia',            label: 'IA / COPILOTE' },
  { value: 'gate',          label: 'Porte de validation' },
  { value: 'support',       label: 'Support' },
  { value: 'marche',        label: 'Mon Marché' },
];

const SEVERITIES = [
  { value: 'VERT',   label: 'Bloquant peu',    color: '#16a34a' },
  { value: 'ORANGE', label: 'Bloquant moyen',  color: '#d97706' },
  { value: 'ROUGE',  label: 'Bloquant total',  color: '#dc2626' },
];

export function SignalerModal({ onClose }) {
  const [form, setForm] = useState({ category: '', friction: '', severity: 'VERT' });
  const [status, setStatus] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async e => {
    e.preventDefault();
    setStatus('saving');
    try {
      const r = await fetch(`${API}/api/frictions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? 'Erreur');
      setStatus('ok');
    } catch (err) {
      setStatus(err.message);
    }
  };

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="friction-title">
        <div className={styles.header}>
          <h2 id="friction-title" className={styles.title}>Signaler un problème</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Fermer">✕</button>
        </div>

        {status === 'ok' ? (
          <div className={styles.success}>
            <p className={styles.successMsg}>✓ Signalement envoyé.</p>
            <p className={styles.successSub}>Merci — ce retour aide à améliorer le programme.</p>
            <button className={styles.doneBtn} onClick={onClose}>Fermer</button>
          </div>
        ) : (
          <form onSubmit={submit} className={styles.form}>
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Catégorie</legend>
              <div className={styles.chips}>
                {CATEGORIES.map(c => (
                  <button
                    type="button" key={c.value}
                    className={`${styles.chip} ${form.category === c.value ? styles.chipActive : ''}`}
                    onClick={() => set('category', c.value)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className={styles.field}>
              <span>Décris le problème ou le blocage</span>
              <textarea
                rows={4} required
                value={form.friction}
                onChange={e => set('friction', e.target.value)}
                placeholder="Ce qui se passe, ce que tu essayais de faire…"
                className={styles.textarea}
              />
            </label>

            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>Sévérité</legend>
              <div className={styles.severityRow}>
                {SEVERITIES.map(s => (
                  <button
                    type="button" key={s.value}
                    className={`${styles.severityBtn} ${form.severity === s.value ? styles.severityActive : ''}`}
                    style={{ '--sev-color': s.color }}
                    onClick={() => set('severity', s.value)}
                  >
                    <span className={styles.dot} />
                    {s.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {status && status !== 'saving' && (
              <p className={styles.err}>{status}</p>
            )}

            <div className={styles.actions}>
              <button type="button" className={styles.cancelBtn} onClick={onClose}>Annuler</button>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={status === 'saving' || !form.category || !form.friction.trim()}
              >
                {status === 'saving' ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
