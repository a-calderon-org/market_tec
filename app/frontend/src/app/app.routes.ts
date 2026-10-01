import { Routes } from '@angular/router';
import { Home } from './features/home/home';
import { PublicationDetail } from './features/publications/publication-detail/publication-detail';
import { MyPublications } from './features/publications/my-publications/my-publications';
import { PublicationCreate } from './features/publications/publication-create/publication-create';
import { Messenger } from './features/messenger/messenger';
import { Login } from './features/auth/login';
<<<<<<< Updated upstream
=======
import { authGuard, guestGuard } from './features/auth/auth.guard';
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream
    path: 'perfil',
    component: Profile
  },
  {
=======
>>>>>>> Stashed changes
    path: 'mis-publicaciones',
    component: MyPublications
  },
  {
    path: 'publicaciones/nueva',
    component: PublicationCreate
  },
  {
    path: 'publicaciones/:id',
    canActivate: [authGuard],
    component: PublicationDetail
  },
  {
    path: 'mensajes',
    component: Messenger
  },
  {
    path: '**',
    redirectTo: ''
  }
];