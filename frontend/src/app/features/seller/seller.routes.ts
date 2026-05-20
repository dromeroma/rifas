import { Routes } from '@angular/router';

import { AdminShellComponent } from '../../layouts/admin-shell/admin-shell.component';

export const SELLER_ROUTES: Routes = [
  {
    path: '',
    component: AdminShellComponent,
    children: [
      { path: '', loadComponent: () => import('./my-sales.component').then((m) => m.MySalesComponent) },
      {
        path: 'customers',
        loadComponent: () => import('../admin/customers.component').then((m) => m.CustomersComponent),
      },
    ],
  },
];
