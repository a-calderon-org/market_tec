import { Routes } from '@angular/router';
import { Home } from './features/home/home';
import { PublicationDetail } from './features/publications/publication-detail/publication-detail';
import { MyPublications } from './features/publications/my-publications/my-publications';
import { PublicationCreate } from './features/publications/publication-create/publication-create';
import { Profile } from './features/profile/profile';
import { Messenger } from './features/messenger/messenger';
import { Login } from './features/auth/login';
import { authGuard } from './features/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: Home
  },
  {
    path: 'login',
    component: Login
  },
  {
    path: 'perfil',
    canActivate: [authGuard],
    component: Profile
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
    component: PublicationDetail
  },
  {
    path: 'mensajes',
    canActivate: [authGuard],
    component: Messenger
  }
];
