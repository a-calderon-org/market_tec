import { Routes } from '@angular/router';
import { Home } from './features/home/home';
import { PublicationDetail } from './features/publications/publication-detail/publication-detail';
import { MyPublications } from './features/publications/my-publications/my-publications';
import { PublicationCreate } from './features/publications/publication-create/publication-create';
import { Profile } from './features/profile/profile';
import { Messenger } from './features/messenger/messenger';

export const routes: Routes = [
  {
    path: '',
    component: Home
  },
  {
    path: 'perfil',
    component: Profile
  },
  {
    path: 'mis-publicaciones',
    component: MyPublications
  },
  {
    path: 'publicaciones/nueva',
    component: PublicationCreate
  },
  {
    path: 'publicaciones/:id',
    component: PublicationDetail
  },
  {
    path: 'mensajes',
    component: Messenger
  }
];