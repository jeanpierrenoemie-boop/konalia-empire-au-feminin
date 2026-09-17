import { useState, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export function useOnboarding() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const saveDraft = useCallback(async (section, answers, lastCompletedStep) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/onboarding/draft`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, answers, lastCompletedStep }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? 'Erreur de sauvegarde');
      }
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const complete = useCallback(async (sections) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/onboarding/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erreur');
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return { saving, error, saveDraft, complete };
}
