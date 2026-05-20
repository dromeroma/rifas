import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';

import { AuthService } from '../services/auth.service';

/**
 * Para rutas que SOLO deben verse cuando NO hay sesión (login).
 * Si el usuario ya tiene token, lo redirige a su landing por rol.
 * Esto evita el bug de "hacer back desde /admin a /login" mostrando el
 * formulario de login a un usuario que en realidad sí está autenticado.
 */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.accessToken) return true;

  if (auth.isAuthenticated()) {
    return router.parseUrl(auth.landingPath());
  }

  // Hay token pero el user aún no se ha cargado: esperamos /auth/me.
  return auth.loadUser().pipe(
    map((u) => (u ? router.parseUrl(auth.landingPath()) : true)),
  );
};
