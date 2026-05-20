import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';

import { UserRole } from '../models/user.model';
import { AuthService } from '../services/auth.service';

export const roleGuard =
  (allowed: UserRole[]): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    const decide = (role: UserRole | null) => {
      if (role && allowed.includes(role)) return true;
      // Si el rol no aplica a esta sección, redirige al landing propio del usuario
      // en vez de patearlo al login (evita "logout aparente" al hacer back/forward).
      if (role) return router.parseUrl(auth.landingPath());
      return router.parseUrl('/login');
    };

    if (auth.isAuthenticated()) return decide(auth.role());

    if (!auth.accessToken) return router.parseUrl('/login');

    return auth.loadUser().pipe(map((u) => decide(u?.role ?? null)));
  };
