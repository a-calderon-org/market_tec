import { Routes } from '@angular/router';
import { Home } from './features/home/home';
import { PublicationDetail } from './features/publications/publication-detail/publication-detail';
import { MyPublications } from './features/publications/my-publications/my-publications';
import { PublicationCreate } from './features/publications/publication-create/publication-create';
import { Messenger } from './features/messenger/messenger';
import { Login } from './features/auth/login';
import { EmailLinkCallback } from './features/auth/email-link-callback';
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
