import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

declare module 'express-session' {
  interface SessionData { user: AuthUser }
}

const google = new OAuth2Client();
export const authRouter = Router();

authRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// JSON requests from our own frontend only, including login and logout.
authRouter.use((req, res, next) => {
  if (req.method === 'POST' &&
      (req.get('origin') !== (process.env.FRONTEND_ORIGIN || 'http://localhost:4200') ||
       !req.is('application/json'))) {
    res.status(403).json({ message: 'Solicitud no permitida.' });
    return;
  }
  next();
});

authRouter.post('/google', async (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    res.status(503).json({ message: 'Falta configurar Google en el servidor.' });
    return;
  }
  if (typeof req.body?.credential !== 'string' || req.body.credential.length > 10000) {
    res.status(400).json({ message: 'Credencial de Google inválida.' });
    return;
  }
  let user: AuthUser;
  try {
    const ticket = await google.verifyIdToken({
      idToken: req.body.credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      res.status(403).json({ message: 'Utiliza una cuenta de Google con correo verificado.' });
      return;
    }
    user = { id: payload.sub, email: payload.email, name: payload.name || payload.email };
  } catch {
    res.status(401).json({ message: 'No fue posible validar tu cuenta de Google. Inténtalo nuevamente.' });
    return;
  }
  req.session.regenerate((err) => {
    if (err) { next(err); return; }
    req.session.user = user;
    req.session.save((saveError) => {
      if (saveError) { next(saveError); return; }
      res.json({ user });
    });
  });
});

authRouter.get('/me', (req, res) => {
  if (!req.session.user) {
    res.status(401).json({ message: 'Inicia sesión para continuar.' });
    return;
  }
  res.json({ user: req.session.user });
});

authRouter.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) { next(err); return; }
    res.clearCookie('market_tec_session', { path: '/' });
    res.sendStatus(204);
  });
});
