import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/landing/landing.component').then((m) => m.LandingComponent),
  },

  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },

  {
    path: 'verify',
    loadComponent: () => import('./features/customer/verify.component').then((m) => m.VerifyComponent),
  },
  {
    path: 'verify/:code',
    loadComponent: () => import('./features/customer/verify.component').then((m) => m.VerifyComponent),
  },
  {
    path: 'rifa/:id',
    loadComponent: () =>
      import('./features/customer/public-raffle.component').then((m) => m.PublicRaffleComponent),
  },
  {
    path: 'subscription-expired',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/subscription/subscription-expired.component').then(
        (m) => m.SubscriptionExpiredComponent,
      ),
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

  { path: '**', redirectTo: '' },
];
