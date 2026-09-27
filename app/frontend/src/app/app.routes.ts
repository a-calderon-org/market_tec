import { Routes } from '@angular/router';

import { Home } from './features/home/home';
import { PublicationDetail } from './features/publications/publication-detail/publication-detail';

export const routes: Routes = [
  {
    path: '',
    component: Home
  },
  {
    path: 'publicaciones/:id',
    component: PublicationDetail
  }
];