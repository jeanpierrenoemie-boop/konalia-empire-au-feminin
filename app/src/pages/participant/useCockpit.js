import { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export function useCockpit() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${API}/api/cockpit`, { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error('Erreur de chargement');
        return r.json();
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}
