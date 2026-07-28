/**
 * PerksShellComponent — layout base del admin panel.
 *
 * Contiene: topbar (marca + user + tema) + sidebar (nav) + main
 * (router-outlet). Wrappea todo en `.perks-scope` para que los
 * design tokens apliquen sin bleed hacia el resto del site.
 *
 * Feature flag: si el backend responde 404 a un ping simple del API
 * (por perks.admin_api OFF), muestra un mensaje amigable en vez de
 * romper la app.
 */
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '@core/services/auth.service';
import { PerksApiService } from '../shared/services/perks-api.service';

interface NavItem {
  label: string;
  path: string;
  icon: string;   // material icon name
  badge?: string;
}

@Component({
  selector: 'perks-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  styleUrl: '../shared/design/perks.scss',
  template: `
    <div class="perks-scope perks-shell" [attr.data-theme]="theme()">
      <!-- ── TOPBAR ─────────────────────────────────────── -->
      <header class="topbar">
        <a routerLink="/perks" class="brand" aria-label="Savvy Perks">
          <span class="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
              <path d="M12 2L15 8L22 9L17 14L18 21L12 18L6 21L7 14L2 9L9 8Z"
                    fill="currentColor" opacity="0.15"/>
              <path d="M12 2L15 8L22 9L17 14L18 21L12 18L6 21L7 14L2 9L9 8Z"
                    stroke="currentColor" stroke-width="1.6"
                    stroke-linejoin="round" fill="none"/>
            </svg>
          </span>
          <span class="brand__text">
            <strong>Savvy</strong>
            <em>Perks</em>
          </span>
        </a>

        <div class="topbar__spacer"></div>

        <button type="button" class="icon-btn"
                (click)="toggleTheme()"
                [attr.aria-label]="theme() === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'">
          <span class="material-icons-outlined">
            {{ theme() === 'dark' ? 'light_mode' : 'dark_mode' }}
          </span>
        </button>

        <div class="user">
          <span class="user__avatar" aria-hidden="true">
            {{ userInitials() }}
          </span>
          <div class="user__meta">
            <span class="user__name">{{ userName() }}</span>
            <span class="user__role">{{ userRole() }}</span>
          </div>
        </div>
      </header>

      <div class="body">
        <!-- ── SIDEBAR ────────────────────────────────── -->
        <nav class="sidebar" aria-label="Navegación principal">
          <ul class="nav">
            @for (item of nav; track item.path) {
              <li>
                <a
                  [routerLink]="item.path"
                  routerLinkActive="nav__item--active"
                  class="nav__item"
                >
                  <span class="material-icons-outlined nav__icon">{{ item.icon }}</span>
                  <span class="nav__label">{{ item.label }}</span>
                  @if (item.badge) {
                    <span class="nav__badge">{{ item.badge }}</span>
                  }
                </a>
              </li>
            }
          </ul>

          <div class="sidebar__footer">
            <a routerLink="/" class="nav__item nav__item--muted">
              <span class="material-icons-outlined nav__icon">logout</span>
              <span class="nav__label">Volver al legacy</span>
            </a>
          </div>
        </nav>

        <!-- ── MAIN ───────────────────────────────────── -->
        <main class="main">
          @if (apiUnavailable()) {
            <div class="unavailable">
              <div class="unavailable__card">
                <span class="material-icons-outlined unavailable__icon">
                  power_settings_new
                </span>
                <h2>Perks aún no está disponible en tu cuenta</h2>
                <p>
                  Este panel se habilita por tenant a medida que
                  hacemos el rollout de Savvy Perks. Escríbenos y lo
                  encendemos para ti.
                </p>
                <a routerLink="/" class="btn btn--primary">Volver al admin actual</a>
              </div>
            </div>
          } @else {
            <router-outlet></router-outlet>
          }
        </main>
      </div>
    </div>
  `,
  styles: [`
    .perks-shell {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      min-height: 100dvh;
    }

    /* ── Topbar ─────────────────────────────────────── */
    .topbar {
      display: flex; align-items: center; gap: var(--p-space-6);
      height: var(--p-topbar-height);
      padding: 0 var(--p-space-7);
      background: var(--p-surface-card);
      border-bottom: 1px solid var(--p-border-subtle);
      position: sticky; top: 0; z-index: 20;
    }
    .brand {
      display: inline-flex; align-items: center; gap: var(--p-space-4);
      color: var(--p-brand-primary);
      text-decoration: none;
    }
    .brand__mark {
      display: inline-flex;
    }
    .brand__text {
      display: inline-flex; gap: 4px; align-items: baseline;
      color: var(--p-text-primary);
      font-size: var(--p-text-lg);
      letter-spacing: 0.01em;
    }
    .brand__text strong { font-weight: var(--p-weight-bold); }
    .brand__text em {
      font-style: normal;
      color: var(--p-brand-primary);
      font-weight: var(--p-weight-semibold);
    }
    .topbar__spacer { flex: 1; }
    .icon-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 34px; height: 34px;
      background: transparent;
      border: 1px solid transparent;
      color: var(--p-text-secondary);
      border-radius: var(--p-radius-md);
      cursor: pointer;
      transition:
        background var(--p-motion-fast) var(--p-ease-out),
        color var(--p-motion-fast) var(--p-ease-out);
    }
    .icon-btn:hover {
      background: var(--p-surface-hover);
      color: var(--p-text-primary);
    }
    .icon-btn .material-icons-outlined { font-size: 20px; }

    .user {
      display: inline-flex; align-items: center; gap: var(--p-space-5);
    }
    .user__avatar {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px;
      background: var(--p-brand-primary-soft);
      color: var(--p-brand-primary);
      border-radius: var(--p-radius-full);
      font-size: 11px;
      font-weight: var(--p-weight-semibold);
      letter-spacing: 0.04em;
    }
    .user__meta { display: none; flex-direction: column; gap: 1px; line-height: 1.1; }
    .user__name { font-size: var(--p-text-md); font-weight: var(--p-weight-medium); }
    .user__role {
      font-size: 10px; letter-spacing: 0.06em;
      color: var(--p-text-muted); text-transform: uppercase;
    }
    @media (min-width: 720px) {
      .user__meta { display: flex; }
    }

    /* ── Body / Sidebar ─────────────────────────────── */
    .body {
      display: flex; flex: 1; min-height: 0;
    }
    .sidebar {
      width: var(--p-sidebar-width);
      padding: var(--p-space-6) var(--p-space-4);
      background: var(--p-surface-card);
      border-right: 1px solid var(--p-border-subtle);
      display: flex; flex-direction: column;
      flex-shrink: 0;
    }
    .nav { list-style: none; padding: 0; margin: 0; display: grid; gap: 2px; }
    .nav__item {
      display: flex; align-items: center; gap: var(--p-space-5);
      padding: var(--p-space-4) var(--p-space-5);
      border-radius: var(--p-radius-md);
      color: var(--p-text-secondary);
      text-decoration: none;
      font-size: var(--p-text-md);
      font-weight: var(--p-weight-medium);
      transition:
        background var(--p-motion-fast) var(--p-ease-out),
        color var(--p-motion-fast) var(--p-ease-out);
    }
    .nav__item:hover {
      background: var(--p-surface-hover);
      color: var(--p-text-primary);
    }
    .nav__item--active {
      background: var(--p-brand-primary-soft);
      color: var(--p-brand-primary);
    }
    .nav__item--muted { color: var(--p-text-muted); font-size: var(--p-text-sm); }
    .nav__icon { font-size: 18px; }
    .nav__label { flex: 1; }
    .nav__badge {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 20px; padding: 0 var(--p-space-4);
      height: 20px;
      background: var(--p-surface-inset);
      color: var(--p-text-secondary);
      border-radius: var(--p-radius-full);
      font-size: 10px;
      font-weight: var(--p-weight-semibold);
    }
    .sidebar__footer { margin-top: auto; padding-top: var(--p-space-6); }

    @media (max-width: 720px) {
      .sidebar { display: none; }
    }

    /* ── Main ───────────────────────────────────────── */
    .main {
      flex: 1;
      min-width: 0;
      overflow-y: auto;
      background: var(--p-surface-canvas);
    }

    /* ── Unavailable state ─────────────────────────── */
    .unavailable {
      min-height: 100%;
      display: flex; align-items: center; justify-content: center;
      padding: var(--p-space-9);
    }
    .unavailable__card {
      max-width: 460px; text-align: center;
      padding: var(--p-space-9);
      background: var(--p-surface-card);
      border: 1px solid var(--p-border-subtle);
      border-radius: var(--p-radius-lg);
      box-shadow: var(--p-shadow-md);
    }
    .unavailable__icon {
      font-size: 40px !important;
      color: var(--p-text-muted);
      margin-bottom: var(--p-space-6);
    }
    .unavailable__card h2 {
      margin: 0 0 var(--p-space-4);
      font-size: var(--p-text-xl);
      color: var(--p-text-primary);
    }
    .unavailable__card p {
      margin: 0 0 var(--p-space-7);
      color: var(--p-text-secondary);
      line-height: var(--p-line-loose);
    }
    .btn {
      display: inline-flex; align-items: center; gap: var(--p-space-4);
      padding: var(--p-space-4) var(--p-space-7);
      border-radius: var(--p-radius-md);
      font-size: var(--p-text-md);
      font-weight: var(--p-weight-semibold);
      cursor: pointer;
      border: 1px solid transparent;
      text-decoration: none;
      transition: transform var(--p-motion-fast) var(--p-ease-out);
    }
    .btn:active { transform: scale(0.98); }
    .btn--primary {
      background: var(--p-brand-primary);
      color: var(--p-text-inverse);
    }
    .btn--primary:hover { background: var(--p-brand-primary-hover); }
  `],
})
export class PerksShellComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly api = inject(PerksApiService);

  readonly theme = signal<'dark' | 'light'>(
    (localStorage.getItem('perks.theme') as 'dark' | 'light') || 'dark',
  );

  readonly apiUnavailable = signal<boolean>(false);

  readonly nav: NavItem[] = [
    { label: 'Customers', path: 'customers', icon: 'person' },
    { label: 'Rules', path: 'rules', icon: 'bolt' },
  ];

  readonly userName = computed(() => this.auth.user()?.full_name ?? 'Admin');
  readonly userRole = computed(() =>
    (this.auth.user()?.role ?? 'admin').toString().replace('_', ' '),
  );
  readonly userInitials = computed(() => {
    const name = this.userName();
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length === 0) return '·';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  });

  constructor() {
    // Ping health-check al API — si el flag está OFF ⇒ 404 ⇒ mostrar
    // pantalla de "aún no disponible". Cualquier otro error no bloquea.
    this.api.listCustomers({ limit: 1 }).subscribe({
      next: () => this.apiUnavailable.set(false),
      error: (err) => {
        if (err?.status === 404) this.apiUnavailable.set(true);
      },
    });
  }

  toggleTheme(): void {
    const next = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    localStorage.setItem('perks.theme', next);
  }
}
