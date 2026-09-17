import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ParticipantLayout } from '../layouts/ParticipantLayout';
import { AdminLayout } from '../layouts/AdminLayout';
import { RequireAuth, RequireElite, RequireAdmin } from '../auth/RequireAuth';
import { RequireOnboarded } from '../auth/RequireOnboarded';
import { LoginPage } from '../pages/LoginPage';
import { OnboardingPage } from '../pages/onboarding/OnboardingPage';
import { CockpitPage } from '../pages/participant/CockpitPage';
import { ParcoursPage } from '../pages/participant/ParcoursPage';
import { CopilotePage } from '../pages/participant/CopilotePage';
import { LabsPage } from '../pages/participant/LabsPage';
import { QGPage } from '../pages/participant/QGPage';
import { RessourcesPage } from '../pages/participant/RessourcesPage';
import { PreuvesPage } from '../pages/participant/PreuvesPage';
import { PasseportPage } from '../pages/participant/PasseportPage';
import { DecisionsPage } from '../pages/participant/DecisionsPage';
import { ParkingPage } from '../pages/participant/ParkingPage';
import { ElitePage } from '../pages/participant/ElitePage';
import { MarchePage } from '../pages/participant/MarchePage';
import { ContactPage } from '../pages/participant/Marche/ContactPage';
import { FicheConversation } from '../pages/participant/Marche/FicheConversation';
import { CarteSignaux } from '../pages/participant/Marche/CarteSignaux';
import { AdminOverviewPage } from '../pages/admin/AdminOverviewPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },

  /* Onboarding — authenticated but not yet onboarded */
  {
    path: '/onboarding',
    element: <RequireAuth><OnboardingPage /></RequireAuth>,
  },

  /* Main app — authenticated + onboarded */
  {
    path: '/',
    element: (
      <RequireAuth>
        <RequireOnboarded>
          <ParticipantLayout />
        </RequireOnboarded>
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/cockpit" replace /> },
      { path: 'cockpit',    element: <CockpitPage />,    handle: { title: 'Mon Cockpit' } },
      { path: 'parcours',   element: <ParcoursPage />,   handle: { title: 'Mon Parcours' } },
      { path: 'copilote',   element: <CopilotePage />,   handle: { title: 'COPILOTE' } },
      { path: 'labs',       element: <LabsPage />,       handle: { title: 'Mes Labs' } },
      { path: 'qg',         element: <QGPage />,         handle: { title: 'Le QG' } },
      { path: 'ressources', element: <RessourcesPage />, handle: { title: 'Mes Ressources' } },
      { path: 'preuves',    element: <PreuvesPage />,    handle: { title: 'Mes Preuves' } },
      { path: 'passeport',  element: <PasseportPage />,  handle: { title: 'Passeport Projet' } },
      { path: 'decisions',  element: <DecisionsPage />,  handle: { title: 'Journal des Décisions' } },
      { path: 'parking',    element: <ParkingPage />,    handle: { title: 'Parking à Idées' } },
      {
        path: 'elite',
        element: <RequireElite><ElitePage /></RequireElite>,
        handle: { title: 'Mes Points ELITE' },
      },
      { path: 'marche/carte',                          element: <CarteSignaux /> },
      { path: 'marche',                                element: <MarchePage /> },
      { path: 'marche/:contactId',                     element: <ContactPage /> },
      { path: 'marche/:contactId/conversation/:convId', element: <FicheConversation /> },
    ],
  },

  {
    path: '/admin',
    element: <RequireAdmin><AdminLayout /></RequireAdmin>,
    children: [
      { index: true, element: <AdminOverviewPage /> },
    ],
  },
]);
