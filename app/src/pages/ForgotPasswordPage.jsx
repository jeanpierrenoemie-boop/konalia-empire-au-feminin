import { useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './ActivationPage.module.css';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await fetch('/api/auth/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setDone(true);
    } catch {
      setError('Erreur réseau. Réessaie dans un instant.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>Demande envoyée</h1>
            <p className={styles.subtitle}>
              Si un compte correspond à cette adresse, un lien de réinitialisation a été généré.
              Contacte Noémie pour obtenir ton lien.
            </p>
          </div>
          <Link to="/login" className={styles.link}>← Retour à la connexion</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Mot de passe oublié</h1>
          <p className={styles.subtitle}>Saisis ton adresse email pour demander un lien de réinitialisation.</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">Adresse email</label>
            <input
              id="email" type="email" className={styles.input}
              value={email} onChange={e => setEmail(e.target.value)}
              required autoComplete="email"
            />
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.btn} disabled={submitting}>
            {submitting ? 'Envoi…' : 'Envoyer la demande'}
          </button>
        </form>

        <Link to="/login" className={styles.link}>← Retour à la connexion</Link>
      </div>
    </div>
  );
}
