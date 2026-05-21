import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken;
  const authed = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authed).pipe(
    catchError((err) => {
      if (err.status === 401) {
        // Si el 401 vino de /auth/me, los guards ya están esperando este
        // resultado y harán su propio redirect (UrlTree). Llamar logout()
        // aquí dispara un router.navigate paralelo que pelea con el guard
        // y puede dejar la app en una navegación cancelada (pantalla negra
        // al refrescar). Para ese caso solo limpiamos sesión.
        if (req.url.endsWith('/auth/me')) {
          auth.clearSession();
        } else {
          auth.logout();
        }
      }
      return throwError(() => err);
    }),
  );
};
