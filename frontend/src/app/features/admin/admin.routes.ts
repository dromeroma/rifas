import { Routes } from '@angular/router';

import { AdminShellComponent } from '../../layouts/admin-shell/admin-shell.component';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminShellComponent,
    children: [
      { path: '', loadComponent: () => import('./dashboard-host.component').then((m) => m.DashboardHostComponent) },
      { path: 'raffles', loadComponent: () => import('./raffles-list.component').then((m) => m.RafflesListComponent) },
      { path: 'raffles/:id', loadComponent: () => import('./raffle-detail.component').then((m) => m.RaffleDetailComponent) },
      { path: 'sellers', loadComponent: () => import('./sellers.component').then((m) => m.SellersComponent) },
      { path: 'sellers/:id', loadComponent: () => import('./seller-detail.component').then((m) => m.SellerDetailComponent) },
      { path: 'tenants', loadComponent: () => import('./tenants.component').then((m) => m.TenantsComponent) },
      { path: 'customers', loadComponent: () => import('./customers.component').then((m) => m.CustomersComponent) },
      { path: 'assignments', loadComponent: () => import('./assignments.component').then((m) => m.AssignmentsComponent) },
      { path: 'payments', loadComponent: () => import('./payments.component').then((m) => m.PaymentsComponent) },
      { path: 'audit', loadComponent: () => import('./audit.component').then((m) => m.AuditComponent) },
    ],
  },
];
