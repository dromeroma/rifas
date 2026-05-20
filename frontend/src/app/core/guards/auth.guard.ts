import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';

import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.accessToken) {
    return router.parseUrl('/login');
  }
  if (auth.isAuthenticated()) return true;

  // Hay token pero el user signal aún no se cargó (ej: refresh de página).
  // Esperamos a /auth/me antes de decidir; así evitamos que roleGuard rechace
  // por carrera al no tener todavía el role.
  return auth.loadUser().pipe(
    map((u) => (u ? true : router.parseUrl('/login'))),
  );
};
