import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { randomBytes } from 'node:crypto';
import { authRouter } from './auth';

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:4200', credentials: true }));
app.use(express.json({ limit: '16kb' }));
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required in production');
}
app.use('/api/auth', session({
  name: 'market_tec_session',
  secret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 }
}), authRouter);

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok'
  });
});

export default app;
