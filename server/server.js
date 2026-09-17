import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import authRoutes from './src/routes/auth.routes.js';
import dataRoutes from './src/routes/data.routes.js';
import onboardingRoutes from './src/routes/onboarding.routes.js';
import cockpitRoutes from './src/routes/cockpit.routes.js';
import parcoursRoutes from './src/routes/parcours.routes.js';

export function createApp() {
  const app = express();

  app.use(cors({
    origin: (process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
    credentials: true,
  }));

  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.use('/auth', authRoutes);
  app.use('/api', dataRoutes);
  app.use('/api/onboarding', onboardingRoutes);
  app.use('/api/cockpit', cockpitRoutes);
  app.use('/api/parcours', parcoursRoutes);

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur interne' });
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const app = createApp();
  const port = process.env.PORT ?? 4000;
  app.listen(port, () => console.log(`RC server on :${port}`));
}
