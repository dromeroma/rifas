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
    // Alias corto para los QR físicos de las boletas. Carga el sitio
    // promocional premium con branding mundialista.
    path: 'r/:id',
    loadComponent: () =>
      import('./features/customer/raffle-promo.component').then((m) => m.RafflePromoComponent),
  },
  {
    // Índice público de todas las rifas activas en Boletera.
    // Cada card linkea a `/r/:id`.
    path: 'rifas',
    loadComponent: () =>
      import('./features/customer/raffles-public-list.component').then(
        (m) => m.RafflesPublicListComponent,
      ),
  },
  {
    path: 'mi-boleta',
    loadComponent: () =>
      import('./features/customer/my-tickets.component').then((m) => m.MyTicketsComponent),
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
    // Vista fullscreen sin shell para imprimir hojas de boletas físicas.
    // Aparte del admin shell para que `window.print()` salga limpio.
    path: 'admin/print/:raffleId/:sellerId',
    canActivate: [authGuard, roleGuard(['super_admin', 'admin'])],
    loadComponent: () =>
      import('./features/admin/ticket-print-page.component').then(
        (m) => m.TicketPrintPageComponent,
      ),
  },

  {
    // Atajo disparado por el QR del desprendible. El admin escanea con su
    // celular el talón que le entrega el vendedor y aterriza acá.
    path: 'admin/registrar-venta',
    canActivate: [authGuard, roleGuard(['super_admin', 'admin'])],
    loadComponent: () =>
      import('./features/admin/register-sale-shortcut.component').then(
        (m) => m.RegisterSaleShortcutComponent,
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
