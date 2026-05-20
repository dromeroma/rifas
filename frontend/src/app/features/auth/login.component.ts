import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '@core/services/auth.service';
import { ButtonComponent, InputComponent, ThemeToggleComponent } from '@shared/ui';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, InputComponent, ThemeToggleComponent],
  template: `
    <main class="login">
      <div class="login__top">
        <span class="brand">🎟️ Sistema Rifas</span>
        <app-theme-toggle />
      </div>

      <section class="login__card">
        <div class="login__hero">
          <h1>Bienvenido</h1>
          <p class="muted">Ingresa con tus credenciales para administrar tus rifas.</p>
        </div>

        <form (ngSubmit)="submit()" class="form">
          <app-input
            label="Email"
            type="email"
            placeholder="tu@correo.com"
            icon="alternate_email"
            autocomplete="username"
            [(ngModel)]="email"
            name="email"
          />
          <app-input
            label="Contraseña"
            type="password"
            placeholder="••••••••"
            icon="lock"
            autocomplete="current-password"
            [(ngModel)]="password"
            name="password"
          />

          @if (error()) {
            <div class="alert">
              <span class="material-icons">error_outline</span>
              {{ error() }}
            </div>
          }

          <app-button type="submit" variant="primary" size="lg" [full]="true" [loading]="loading()">
            {{ loading() ? 'Ingresando...' : 'Iniciar sesión' }}
          </app-button>
        </form>

        <small class="login__foot">¿Olvidaste tu contraseña? Contacta al administrador.</small>
      </section>

      <div class="login__bg" aria-hidden="true">
        <div class="blob blob-1"></div>
        <div class="blob blob-2"></div>
      </div>
    </main>
  `,
  styles: [`
    .login {
      min-height: 100dvh;
      display: grid;
      grid-template-rows: auto 1fr;
      padding: var(--s-4);
      position: relative;
      overflow: hidden;
      background: var(--bg-base);
    }
    .login__top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: relative; z-index: 1;
    }
    .brand { font-weight: 700; color: var(--text); font-size: 16px; }

    .login__card {
      position: relative; z-index: 1;
      width: 100%;
      max-width: 420px;
      margin: auto;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-xl);
      padding: var(--s-6);
      box-shadow: var(--shadow-lg);
      display: grid;
      gap: var(--s-5);
    }
    .login__hero h1 { font-size: 26px; margin-bottom: 4px; }
    .login__hero .muted { color: var(--text-muted); font-size: 14px; }

    .form { display: grid; gap: var(--s-4); }

    .alert {
      display: flex; align-items: center; gap: 8px;
      padding: var(--s-3);
      background: var(--danger-soft);
      color: var(--danger);
      border-radius: var(--r-md);
      font-size: 13px;
    }
    .alert .material-icons { font-size: 18px; }

    .login__foot { text-align: center; color: var(--text-faint); font-size: 12px; }

    /* Fondo decorativo */
    .login__bg {
      position: absolute; inset: 0;
      overflow: hidden;
      z-index: 0;
      pointer-events: none;
    }
    .blob {
      position: absolute;
      width: 480px; height: 480px;
      border-radius: 50%;
      filter: blur(110px);
      opacity: 0.35;
    }
    .blob-1 { background: var(--accent); top: -180px; right: -160px; }
    .blob-2 { background: var(--info); bottom: -200px; left: -160px; opacity: 0.25; }
  `],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);

  submit() {
    if (!this.email || !this.password) {
      this.error.set('Completa email y contraseña');
      return;
    }
    this.error.set(null);
    this.loading.set(true);
    this.auth.login(this.email, this.password).subscribe({
      next: (u) => {
        const target = u.role === 'seller' ? '/seller' : '/admin';
        this.router.navigate([target]);
      },
      error: (e) => {
        this.error.set(e?.error?.detail ?? 'No se pudo iniciar sesión');
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }
}
