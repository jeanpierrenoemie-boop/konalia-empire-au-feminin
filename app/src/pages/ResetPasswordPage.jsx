import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import styles from './ActivationPage.module.css';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();

  const [check, setCheck] = useState(null);
  const [checkError, setCheckError] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setCheckError('Lien de réinitialisation invalide ou incomplet.'); return; }
    fetch(`/api/auth/reset-check?token=${encodeURIComponent(token)}`)
      .then(r => r.json().then(b => ({ ok: r.ok, body: b })))
      .then(({ ok, body }) => {
        if (!ok) setCheckError(body.error ?? 'Lien invalide ou expiré.');
        else     setCheck(body);
      })
      .catch(() => setCheckError('Erreur réseau. Réessaie dans un instant.'));
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setSubmitError('Les mots de passe ne correspondent pas.'); return; }
    if (password.length < 8)  { setSubmitError('Le mot de passe doit contenir au moins 8 caractères.'); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const body = await r.json();
      if (!r.ok) { setSubmitError(body.error ?? 'Erreur lors de la réinitialisation.'); return; }
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch {
      setSubmitError('Erreur réseau. Réessaie dans un instant.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token || checkError) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Lien invalide</h1>
          <p className={styles.error}>{checkError ?? 'Lien manquant.'}</p>
          <Link to="/forgot-password" className={styles.link}>Demander un nouveau lien →</Link>
        </div>
      </div>
    );
  }

  if (!check) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <p className={styles.loading}>Vérification du lien…</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.successIcon}>✓</div>
          <h1 className={styles.title}>Mot de passe réinitialisé</h1>
          <p className={styles.subtitle}>Redirection vers la connexion…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Nouveau mot de passe</h1>
          <p className={styles.subtitle}>Choisis un nouveau mot de passe pour {check.first_name}.</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">Email</label>
            <input id="email" type="email" className={styles.input} value={check.email} readOnly disabled />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">Nouveau mot de passe</label>
            <input
              id="password" type="password" className={styles.input}
              placeholder="Minimum 8 caractères"
              value={password} onChange={e => setPassword(e.target.value)}
              required minLength={8} autoComplete="new-password"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirm">Confirmer</label>
            <input
              id="confirm" type="password" className={styles.input}
              placeholder="Même mot de passe"
              value={confirm} onChange={e => setConfirm(e.target.value)}
              required minLength={8} autoComplete="new-password"
            />
          </div>
          {submitError && <p className={styles.error}>{submitError}</p>}
          <button type="submit" className={styles.btn} disabled={submitting}>
            {submitting ? 'Réinitialisation…' : 'Réinitialiser mon mot de passe →'}
          </button>
        </form>
      </div>
    </div>
  );
}
