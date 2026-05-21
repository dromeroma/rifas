import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, of, shareReplay, switchMap, tap, timeout } from 'rxjs';

import { environment } from '@env/environment';
import { TokenPair, User } from '../models/user.model';

const ACCESS_KEY = 'rifas.access';
const REFRESH_KEY = 'rifas.refresh';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly user = signal<User | null>(null);
  readonly isAuthenticated = computed(() => !!this.user());
  readonly role = computed(() => this.user()?.role ?? null);

  /** Carga en curso de /auth/me, compartida para evitar múltiples requests simultáneos. */
  private loadInFlight$: Observable<User | null> | null = null;

  get accessToken(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  }

  /**
   * Landing por rol. Si no hay rol cargado, default al área de admin
   * (el roleGuard de /admin redirigirá al vendedor si corresponde).
   */
  landingPath(): string {
    return this.role() === 'seller' ? '/seller' : '/admin';
  }

  /**
   * Login: guarda los tokens, carga el usuario y emite el User al subscriber.
   * El subscriber NO se notifica hasta que el user está poblado, lo que
   * previene la condición de carrera con el roleGuard.
   */
  login(email: string, password: string): Observable<User> {
    return this.http
      .post<TokenPair>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(
        tap((tokens) => {
          localStorage.setItem(ACCESS_KEY, tokens.access_token);
          localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
        }),
        switchMap(() => this.http.get<User>(`${environment.apiUrl}/auth/me`)),
        tap((u) => this.user.set(u)),
      );
  }

  /**
   * Carga el usuario actual con el token guardado. Devuelve el User o null
   * si no hay token / el token ya no es válido (en cuyo caso cierra sesión).
   * Múltiples llamadas concurrentes comparten un solo request en vuelo.
   */
  loadUser(): Observable<User | null> {
    if (!this.accessToken) return of(null);
    if (this.user()) return of(this.user());

    if (!this.loadInFlight$) {
      this.loadInFlight$ = this.http.get<User>(`${environment.apiUrl}/auth/me`).pipe(
        // Render Free duerme y demora ~30s en despertar; 25s es el tope
        // razonable para no dejar la app colgada indefinidamente.
        timeout(25_000),
        tap((u) => this.user.set(u)),
        catchError(() => {
          this.clearSession();
          return of(null);
        }),
        tap(() => (this.loadInFlight$ = null)),
        shareReplay(1),
      );
    }
    return this.loadInFlight$;
  }

  /** Limpia tokens y signal sin navegar (uso interno desde guards/interceptor). */
  clearSession(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    this.user.set(null);
    this.loadInFlight$ = null;
  }

  logout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }
}
