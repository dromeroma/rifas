import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService } from '@core/services/auth.service';

interface NavItem {
  path: string;
  icon: string;
  label: string;
  roles: ('super_admin' | 'admin' | 'seller')[];
}

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <nav class="bn" role="navigation" aria-label="Navegación principal">
      @for (it of primary(); track it.path) {
        <a [routerLink]="it.path"
           [routerLinkActiveOptions]="{ exact: it.path === '/admin' }"
           routerLinkActive="bn__item--active"
           class="bn__item">
          <span class="material-icons">{{ it.icon }}</span>
          <small>{{ it.label }}</small>
        </a>
      }

      @if (overflow().length) {
        <button class="bn__item" (click)="toggleMore()" [class.bn__item--active]="moreOpen()">
          <span class="material-icons">{{ moreOpen() ? 'close' : 'apps' }}</span>
          <small>Más</small>
        </button>
      }
    </nav>

    @if (moreOpen()) {
      <div class="more-overlay" (click)="closeMore()">
        <div class="more-sheet" (click)="$event.stopPropagation()">
          <header class="more-sheet__head">
            <strong>Más opciones</strong>
            <button class="icon-btn" (click)="closeMore()">
              <span class="material-icons">close</span>
            </button>
          </header>
          <div class="more-sheet__grid">
            @for (it of overflow(); track it.path) {
              <a [routerLink]="it.path" routerLinkActive="more-item--active" class="more-item" (click)="closeMore()">
                <span class="material-icons">{{ it.icon }}</span>
                <span>{{ it.label }}</span>
              </a>
            }
            <button class="more-item" (click)="logout()">
              <span class="material-icons">logout</span>
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .bn {
      position: fixed;
      left: 0; right: 0; bottom: 0;
      height: var(--h-bottom-nav);
      background: var(--bg-surface);
      border-top: 1px solid var(--border);
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      align-items: center;
      z-index: var(--z-bottom-nav);
      padding: 0 4px;
      padding-bottom: env(safe-area-inset-bottom, 0);
    }

    .bn__item {
      background: transparent;
      border: 0;
      display: grid;
      place-items: center;
      gap: 2px;
      padding: 6px 2px;
      color: var(--text-faint);
      text-decoration: none;
      cursor: pointer;
      transition: color var(--t-fast);
      min-width: 44px;
      min-height: 48px;
    }
    .bn__item .material-icons { font-size: 22px; }
    .bn__item small { font-size: 10px; letter-spacing: 0.02em; }
    .bn__item--active { color: var(--accent); }
    .bn__item--active .material-icons {
      background: var(--accent-soft);
      border-radius: var(--r-full);
      padding: 4px 14px;
      margin-bottom: -2px;
    }

    .more-overlay {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(2px);
      z-index: calc(var(--z-bottom-nav) + 5);
      display: flex; align-items: flex-end;
      animation: fade-in var(--t-fast) ease;
    }
    .more-sheet {
      width: 100%;
      background: var(--bg-surface);
      border-top-left-radius: var(--r-xl);
      border-top-right-radius: var(--r-xl);
      padding: var(--s-4);
      padding-bottom: calc(var(--h-bottom-nav) + env(safe-area-inset-bottom, 0) + var(--s-4));
      animation: slide-up var(--t-base) ease;
    }
    .more-sheet__head {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: var(--s-3);
    }
    .more-sheet__grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--s-2);
    }
    .more-item {
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      padding: var(--s-3);
      display: grid;
      place-items: center;
      gap: 4px;
      color: var(--text);
      text-decoration: none;
      cursor: pointer;
      font-size: 12px;
      min-height: 80px;
    }
    .more-item .material-icons { color: var(--text-muted); font-size: 22px; }
    .more-item:hover { border-color: var(--accent); }
    .more-item--active { background: var(--accent-soft); color: var(--accent); }
    .more-item--active .material-icons { color: var(--accent); }

    .icon-btn {
      width: 32px; height: 32px;
      background: var(--bg-hover);
      border: 0; border-radius: var(--r-full);
      display: grid; place-items: center;
      color: var(--text-muted);
      cursor: pointer;
    }

    @keyframes slide-up { from { transform: translateY(40%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  `],
})
export class BottomNavComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly nav = input<NavItem[]>([]);
  readonly moreOpen = signal(false);

  readonly visibleItems = computed<NavItem[]>(() => {
    const role = this.auth.user()?.role;
    if (!role) return [];
    return this.nav().filter((n) => n.roles.includes(role));
  });

  readonly primary = computed(() => this.visibleItems().slice(0, 4));
  readonly overflow = computed(() => this.visibleItems().slice(4));

  toggleMore() { this.moreOpen.update((v) => !v); }
  closeMore() { this.moreOpen.set(false); }

  logout() {
    this.closeMore();
    this.auth.logout();
  }
}
