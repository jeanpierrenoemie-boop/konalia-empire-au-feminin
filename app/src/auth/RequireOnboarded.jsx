import { Navigate } from 'react-router-dom';
import { useOnboardingStatus } from './useOnboardingStatus';
import { LoadingState } from '../components/states/LoadingState';

/**
 * If onboarding is not yet complete, redirect to /onboarding.
 * Used to wrap the main app shell.
 */
export function RequireOnboarded({ children }) {
  const { loading, completed } = useOnboardingStatus();

  if (loading) return <LoadingState label="Chargement de ton profil…" />;
  if (!completed) return <Navigate to="/onboarding" replace />;
  return children;
}
