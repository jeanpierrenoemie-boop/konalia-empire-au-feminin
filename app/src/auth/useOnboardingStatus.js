import { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

let _cache = null; // per-session cache, invalidated on logout

export function useOnboardingStatus() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!user) { setLoading(false); setCompleted(false); return; }

    if (_cache?.userId === user.id) {
      setCompleted(_cache.completed);
      setLoading(false);
      return;
    }

    fetch(`${API}/api/onboarding/state`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        const done = Boolean(data.completed);
        _cache = { userId: user.id, completed: done };
        setCompleted(done);
      })
      .catch(() => setCompleted(false))
      .finally(() => setLoading(false));
  }, [user]);

  function markCompleted() {
    if (user) _cache = { userId: user.id, completed: true };
    setCompleted(true);
  }

  return { loading, completed, markCompleted };
}

export function invalidateOnboardingCache() {
  _cache = null;
}
