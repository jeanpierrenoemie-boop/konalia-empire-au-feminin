import rateLimit from 'express-rate-limit';

const skip = () => process.env.NODE_ENV === 'test';

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: 'Trop de tentatives. Réessaie dans 15 minutes.' },
});

export const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  message: { error: 'Trop de demandes. Réessaie dans une heure.' },
});
