import { Routes } from '@angular/router';
import { Home } from './features/home/home';
import { PublicationDetail } from './features/publications/publication-detail/publication-detail';
import { MyPublications } from './features/publications/my-publications/my-publications';
import { PublicationCreate } from './features/publications/publication-create/publication-create';
import { Messenger } from './features/messenger/messenger';
import { Login } from './features/auth/login';
import { EmailLinkCallback } from './features/auth/email-link-callback';
import { PasswordSetup } from './features/auth/password-setup';
import { CompleteProfile } from './features/profile/complete-profile';
import { authGuard, guestGuard } from './features/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    component: Home
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    component: Login
  },
  {
    // Destino del Magic Link institucional; sin guard: la confirmación crea la sesión.
    path: 'acceso/correo',
    component: EmailLinkCallback
  },
  {
    // Destino del enlace de recuperación: mismo canje que el Magic Link, con mensajes propios.
    path: 'acceso/recuperar',
    component: EmailLinkCallback,
    data: { purpose: 'recovery' }
  },
  {
    // Primera contraseña: solo con sesión; ms-users exige además la concesión de un solo uso del enlace confirmado.
    path: 'contrasena',
    canActivate: [authGuard],
    component: PasswordSetup
  },
  {
    // Datos básicos tras el registro (nombre y apellidos); nunca nombre de usuario ni contraseña.
    path: 'registro/datos',
    canActivate: [authGuard],
    component: CompleteProfile
  },
  {
    path: 'mis-publicaciones',
    canActivate: [authGuard],
    component: MyPublications
  },
  {
    path: 'publicaciones/nueva',
    canActivate: [authGuard],
    component: PublicationCreate
  },
  {
    path: 'publicaciones/:id',
    canActivate: [authGuard],
    component: PublicationDetail
  },
  {
    path: 'mensajes',
    canActivate: [authGuard],
    component: Messenger
  },
  {
    path: '**',
    redirectTo: ''
  }
];
