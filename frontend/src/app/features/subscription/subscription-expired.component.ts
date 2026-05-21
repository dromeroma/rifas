import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '@core/services/auth.service';
import { ButtonComponent, ThemeToggleComponent } from '@shared/ui';

@Component({
  selector: 'app-subscription-expired',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonComponent, ThemeToggleComponent],
  template: `
    <main class="page">
      <header class="page__top">
        <a routerLink="/" class="brand" aria-label="Inicio">🎟️ <strong>Boletera</strong></a>
        <app-theme-toggle />
      </header>

      <section class="hero">
        <span class="material-icons hero__icon">credit_card_off</span>
        <h1>Tu suscripción venció.</h1>
        <p class="muted">
          Tu cuenta <strong>{{ tenantName() }}</strong> superó el periodo de gracia
          de 7 días. Para volver a usar Boletera, contacta al equipo y renueva tu plan.
        </p>

        <div class="contact-card">
          <h2>Cómo renovar</h2>
          <ul>
            <li>
              <span class="material-icons">mail</span>
              <span>Escríbenos a
                <a href="mailto:deimerromeromadera&#64;gmail.com?subject=Renovar%20suscripci%C3%B3n%20{{ tenantName() }}">
                  deimerromeromadera&#64;gmail.com
                </a>
              </span>
            </li>
            <li>
              <span class="material-icons">history</span>
              <span>Tu data se conserva intacta. Cuando renueves, tendrás acceso
                inmediato a todas tus rifas, vendedores y reportes.</span>
            </li>
          </ul>
        </div>

        <div class="actions">
          <app-button variant="secondary" icon="logout" (click)="logout()">
            Cerrar sesión
          </app-button>
        </div>
      </section>
    </main>
  `,
  styles: [`
    .page {
      min-height: 100dvh;
      background: var(--bg-base);
      display: grid;
      grid-template-rows: auto 1fr;
    }
    .page__top {
      display: flex; justify-content: space-between; align-items: center;
      padding: var(--s-4);
      max-width: 540px;
      margin: 0 auto;
      width: 100%;
    }
    .brand {
      font-weight: 500; font-size: 15px; color: var(--text);
      text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
    }
    .brand strong { font-weight: 700; }

    .hero {
      max-width: 540px;
      margin: 0 auto;
      width: 100%;
      padding: var(--s-6) var(--s-4);
      display: grid;
      gap: var(--s-4);
      text-align: center;
    }
    .hero__icon {
      font-size: 64px !important;
      color: var(--danger);
      background: var(--danger-soft);
      width: 96px; height: 96px;
      border-radius: 50%;
      display: grid; place-items: center;
      margin: 0 auto;
    }
    .hero h1 {
      margin: 0;
      font-size: 28px;
      color: var(--text);
    }
    .muted {
      color: var(--text-muted);
      margin: 0 auto;
      max-width: 460px;
      line-height: 1.55;
    }

    .contact-card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: var(--s-4);
      text-align: left;
    }
    .contact-card h2 {
      font-size: 14px;
      color: var(--text-muted);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin: 0 0 var(--s-3);
    }
    .contact-card ul {
      list-style: none; padding: 0; margin: 0;
      display: grid; gap: var(--s-3);
    }
    .contact-card li {
      display: flex; gap: var(--s-3); align-items: flex-start;
      font-size: 14px;
      color: var(--text);
    }
    .contact-card .material-icons { color: var(--accent); font-size: 20px; flex-shrink: 0; margin-top: 1px; }
    .contact-card a { color: var(--accent); font-weight: 600; }

    .actions { display: flex; justify-content: center; gap: var(--s-3); }
  `],
})
export class SubscriptionExpiredComponent {
  private readonly auth = inject(AuthService);

  tenantName(): string {
    return this.auth.user()?.tenant?.name ?? 'tu cuenta';
  }

  logout() {
    this.auth.logout();
  }
}
