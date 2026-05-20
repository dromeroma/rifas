import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },

  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },

  {
    path: 'verify/:code',
    loadComponent: () => import('./features/customer/verify.component').then((m) => m.VerifyComponent),
  },

  {
    path: 'admin',
    canActivate: [authGuard, roleGuard(['super_admin', 'admin'])],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },

  {
    path: 'seller',
    canActivate: [authGuard, roleGuard(['seller', 'admin', 'super_admin'])],
    loadChildren: () => import('./features/seller/seller.routes').then((m) => m.SELLER_ROUTES),
  },

  { path: '**', redirectTo: 'login' },
];
