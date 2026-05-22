import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, catchError, filter, switchMap, take, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';

// Estado compartido para coordinar refresh entre requests concurrentes.
// Cuando arranca un refresh, los demás 401 se quedan esperando aquí en vez
// de disparar N refresh paralelos (que rotarían el token N veces y todos
// menos el primero fallarían).
let refreshing = false;
const refreshed$ = new BehaviorSubject<string | null>(null);

function attachToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const authed = attachToken(req, auth.accessToken);

  return next(authed).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 402) {
        // Suscripción vencida o en periodo de gracia.
        const detail = err?.error?.detail;
        const code = typeof detail === 'object' ? detail?.code : null;
        if (code === 'subscription_expired') {
          router.navigate(['/subscription-expired']);
        }
        return throwError(() => err);
      }

      if (err.status !== 401) return throwError(() => err);

      // Endpoints de auth: no intentamos refresh (evitamos bucles).
      const url = req.url;
      const isAuthEndpoint =
        url.endsWith('/auth/login') ||
        url.endsWith('/auth/refresh');

      if (isAuthEndpoint || !auth.refreshToken) {
        // 401 directo en login/refresh, o no hay refresh disponible → sesión muerta.
        if (url.endsWith('/auth/me')) {
          auth.clearSession();
        } else {
          auth.logout();
        }
        return throwError(() => err);
      }

      // Ya hay un refresh en curso: encolar este request hasta que termine
      // y luego reintentar con el nuevo access token.
      if (refreshing) {
        return refreshed$.pipe(
          filter((token): token is string => token !== null),
          take(1),
          switchMap((token) => next(attachToken(req, token))),
        );
      }

      // Iniciar refresh: bloquear a otros, llamar /auth/refresh, despertar la cola.
      refreshing = true;
      refreshed$.next(null);

      return auth.refresh().pipe(
        switchMap((tokens) => {
          refreshing = false;
          refreshed$.next(tokens.access_token);
          return next(attachToken(req, tokens.access_token));
        }),
        catchError((refreshErr) => {
          refreshing = false;
          refreshed$.next(null);
          // El refresh murió (token expirado por inactividad > 60min, o inválido):
          // cerramos sesión definitivamente.
          if (url.endsWith('/auth/me')) {
            auth.clearSession();
          } else {
            auth.logout();
          }
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
