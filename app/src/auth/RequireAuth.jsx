import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { LoadingState } from '../components/states/LoadingState';

export function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user === undefined) return <LoadingState label="Vérification de la session…" />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

export function RequireElite({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user === undefined) return <LoadingState label="Vérification…" />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  if (user.tier !== 'ELITE' && user.role !== 'NOEMIE_ADMIN') {
    return <Navigate to="/cockpit" replace />;
  }
  return children;
}

export function RequireAdmin({ children }) {
  const { user } = useAuth();

  if (user === undefined) return <LoadingState label="Vérification…" />;
  if (!user || user.role !== 'NOEMIE_ADMIN') {
    return <Navigate to="/cockpit" replace />;
  }
  return children;
}
