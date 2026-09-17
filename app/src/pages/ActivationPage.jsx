import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styles from './ActivationPage.module.css';

export function ActivationPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();

  const [invitation, setInvitation] = useState(null);
  const [checkError, setCheckError] = useState(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setCheckError('Lien d\'activation invalide ou incomplet.'); return; }
    fetch(`/api/invitations/check?token=${encodeURIComponent(token)}`)
      .then(r => r.json().then(b => ({ ok: r.ok, body: b })))
      .then(({ ok, body }) => {
        if (!ok) setCheckError(body.error ?? 'Invitation invalide ou expirée.');
        else     setInvitation(body);
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
      const r = await fetch('/api/invitations/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const body = await r.json();
      if (!r.ok) { setSubmitError(body.error ?? 'Erreur lors de l\'activation.'); return; }
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
          <h1 className={styles.title}>Activation impossible</h1>
          <p className={styles.error}>{checkError ?? 'Lien manquant.'}</p>
          <a href="/login" className={styles.link}>Aller à la connexion →</a>
        </div>
      </div>
    );
  }

  if (!invitation) {
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
          <h1 className={styles.title}>Compte activé !</h1>
          <p className={styles.subtitle}>Bienvenue, {invitation.first_name}. Redirection vers la connexion…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Bienvenue, {invitation.first_name}</h1>
          <p className={styles.subtitle}>
            Crée ton mot de passe pour accéder à Reprise de Contrôle.
          </p>
          <div className={styles.planBadge}>
            {invitation.plan}
          </div>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">Email</label>
            <input
              id="email" type="email" className={styles.input}
              value={invitation.email} readOnly disabled
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">Mot de passe</label>
            <input
              id="password" type="password" className={styles.input}
              placeholder="Minimum 8 caractères"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirm">Confirmer le mot de passe</label>
            <input
              id="confirm" type="password" className={styles.input}
              placeholder="Même mot de passe"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required minLength={8}
              autoComplete="new-password"
            />
          </div>

          {submitError && <p className={styles.error}>{submitError}</p>}

          <button type="submit" className={styles.btn} disabled={submitting}>
            {submitting ? 'Activation…' : 'Activer mon compte →'}
          </button>
        </form>

        <p className={styles.expiry}>
          Ce lien expire le {new Date(invitation.expires_at).toLocaleDateString('fr-FR', {
            day: 'numeric', month: 'long', year: 'numeric',
          })}.
        </p>
      </div>
    </div>
  );
}
