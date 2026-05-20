import { Routes } from '@angular/router';

import { AdminShellComponent } from '../../layouts/admin-shell/admin-shell.component';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminShellComponent,
    children: [
      { path: '', loadComponent: () => import('./dashboard.component').then((m) => m.AdminDashboardComponent) },
      { path: 'raffles', loadComponent: () => import('./raffles-list.component').then((m) => m.RafflesListComponent) },
      { path: 'raffles/:id', loadComponent: () => import('./raffle-detail.component').then((m) => m.RaffleDetailComponent) },
      { path: 'sellers', loadComponent: () => import('./sellers.component').then((m) => m.SellersComponent) },
      { path: 'customers', loadComponent: () => import('./customers.component').then((m) => m.CustomersComponent) },
      { path: 'assignments', loadComponent: () => import('./assignments.component').then((m) => m.AssignmentsComponent) },
      { path: 'payments', loadComponent: () => import('./payments-placeholder.component').then((m) => m.PaymentsPlaceholderComponent) },
      { path: 'audit', loadComponent: () => import('./audit-placeholder.component').then((m) => m.AuditPlaceholderComponent) },
    ],
  },
];
