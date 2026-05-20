import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, switchMap, tap } from 'rxjs';

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

  get accessToken(): string | null {
    return localStorage.getItem(ACCESS_KEY);
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

  loadUser(): void {
    if (!this.accessToken) return;
    this.http.get<User>(`${environment.apiUrl}/auth/me`).subscribe({
      next: (u) => this.user.set(u),
      error: () => this.logout(),
    });
  }

  logout(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    this.user.set(null);
    this.router.navigate(['/login']);
  }
}
