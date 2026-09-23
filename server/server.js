import 'dotenv/config';
import express from 'express';
import { initAdapter } from './src/db/adapter.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './src/routes/auth.routes.js';
import dataRoutes from './src/routes/data.routes.js';
import onboardingRoutes from './src/routes/onboarding.routes.js';
import cockpitRoutes from './src/routes/cockpit.routes.js';
import parcoursRoutes from './src/routes/parcours.routes.js';
import passeportRoutes from './src/routes/passeport.routes.js';
import decisionsRoutes from './src/routes/decisions.routes.js';
import preuvesRoutes from './src/routes/preuves.routes.js';
import parkingRoutes from './src/routes/parking.routes.js';
import labsRoutes from './src/routes/labs.routes.js';
import eliteRoutes from './src/routes/elite.routes.js';
import adminCockpitRoutes from './src/routes/admin.routes.js';
import copiloteRoutes from './src/routes/copilote.routes.js';
import marcheRoutes from './src/routes/marche.routes.js';
import frictionsRoutes from './src/routes/frictions.routes.js';
import notificationsRoutes from './src/routes/notifications.routes.js';
import missionsRouter from './src/routes/missions.routes.js';
import invitationsRouter from './src/routes/invitations.routes.js';
import weeklyReviewRouter from './src/routes/weekly-review.routes.js';
import s1Router from './src/routes/s1.routes.js';
import s2Router from './src/routes/s2.routes.js';
import s3Router from './src/routes/s3.routes.js';
import s4Router from './src/routes/s4.routes.js';
import s5Router from './src/routes/s5.routes.js';
import s6Router from './src/routes/s6.routes.js';
import s7Router from './src/routes/s7.routes.js';
import s8Router from './src/routes/s8.routes.js';

export function createApp() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));

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
  app.use('/api/parcours', missionsRouter);
  app.use('/api/passeport', passeportRoutes);
  app.use('/api/decisions', decisionsRoutes);
  app.use('/api/preuves', preuvesRoutes);
  app.use('/api/parking', parkingRoutes);
  app.use('/api/copilote', copiloteRoutes);
  app.use('/api/marche', marcheRoutes);
  app.use('/api/labs', labsRoutes);
  app.use('/api/elite', eliteRoutes);
  app.use('/api/admin', adminCockpitRoutes);
  app.use('/api/frictions', frictionsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/invitations', invitationsRouter);
  app.use('/api/weekly-review', weeklyReviewRouter);
  app.use('/api/s1', s1Router);
  app.use('/api/s2', s2Router);
  app.use('/api/s3', s3Router);
  app.use('/api/s4', s4Router);
  app.use('/api/s5', s5Router);
  app.use('/api/s6', s6Router);
  app.use('/api/s7', s7Router);
  app.use('/api/s8', s8Router);

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur interne' });
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const driver = process.env.DB_DRIVER ?? 'sqlite';
  if (driver === 'postgres') {
    if (!process.env.DATABASE_URL) {
      console.error('FATAL: DB_DRIVER=postgres requires DATABASE_URL');
      process.exit(1);
    }
    await initAdapter({ driver: 'postgres', connectionString: process.env.DATABASE_URL });
    console.log('DB adapter: PostgreSQL');
  } else {
    const dbPath = process.env.DB_PATH ?? './data/rc.db';
    await initAdapter({ driver: 'sqlite', filename: dbPath });
    console.log(`DB adapter: SQLite (${dbPath})`);
  }

  const app = createApp();
  const port = process.env.PORT ?? 4000;
  app.listen(port, () => console.log(`RC server on :${port}`));
}
