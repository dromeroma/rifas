import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { environment } from '@env/environment';
import { WhatsAppButtonComponent } from '@shared/components/whatsapp-button/whatsapp-button.component';
import {
  ButtonComponent, CardComponent, ChipComponent, InputComponent, ThemeToggleComponent,
} from '@shared/ui';

interface MyTicket {
  ticket_id: number;
  ticket_label: string;
  ticket_code: string;
  status: string;
  is_paid: boolean;
  is_winner: boolean;
  numbers: string[];
  customer_name: string | null;
  raffle: {
    id: number;
    name: string;
    final_draw_date: string;
    lottery_name: string | null;
    responsible_phone: string | null;
    primary_color: string | null;
  };
  verify_url: string;
}

interface MyTicketsResponse {
  matched: boolean;
  customer_name?: string;
  tickets: MyTicket[];
}

@Component({
  selector: 'app-my-tickets',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    ButtonComponent, CardComponent, ChipComponent, InputComponent, ThemeToggleComponent,
    WhatsAppButtonComponent,
  ],
  template: `
    <main class="page">
      <header class="page__top">
        <a routerLink="/" class="brand" aria-label="Inicio">🎟️ <strong>Boletera</strong></a>
        <app-theme-toggle />
      </header>

      <div class="container">

        <!-- Formulario inicial -->
        @if (!data()) {
          <app-card title="Mis boletas" subtitle="Consulta todas tus boletas con tu número de teléfono">
            <form class="form" (ngSubmit)="search()">
              <app-input
                label="Teléfono"
                placeholder="Ej: 3001234567"
                icon="phone"
                inputmode="tel"
                [(ngModel)]="phoneInput"
                name="phone"
                hint="Escribe el número que diste al comprar (con o sin +57). Te mostramos todas tus boletas en cualquier rifa."
              />
              @if (error()) {
                <div class="alert">
                  <span class="material-icons">error_outline</span>
                  {{ error() }}
                </div>
              }
              <app-button type="submit" variant="primary" size="lg" [full]="true" [loading]="loading()">
                Buscar mis boletas
              </app-button>
            </form>
            <small class="muted footer-note">
              ¿Solo quieres verificar UNA boleta? Usa
              <a routerLink="/verify">Verificar boleta</a> con tu código.
            </small>
          </app-card>
        }

        <!-- Resultados -->
        @if (data(); as d) {
          <header class="results__head">
            <h1>
              @if (d.matched && d.customer_name) {
                Hola, {{ d.customer_name }} 👋
              } @else {
                No encontramos boletas
              }
            </h1>
            <button class="link-btn" (click)="reset()">
              <span class="material-icons">arrow_back</span>
              Buscar otro número
            </button>
          </header>

          @if (!d.matched || !d.tickets.length) {
            <app-card>
              <div class="empty">
                <span class="material-icons">search_off</span>
                <h2>Sin boletas registradas con este teléfono</h2>
                <p class="muted">
                  Verifica que escribiste el mismo número que diste al comprar.
                  Si crees que hay un error, contacta al organizador de la rifa.
                </p>
              </div>
            </app-card>
          } @else {
            <p class="muted summary">
              {{ d.tickets.length }} boleta(s) en {{ raffleCount(d.tickets) }} rifa(s).
            </p>

            <ul class="tickets">
              @for (t of d.tickets; track t.ticket_id) {
                <li class="ticket" [class.ticket--paid]="t.is_paid" [class.ticket--winner]="t.is_winner">
                  <header class="ticket__head">
                    <div>
                      <small class="muted">{{ t.raffle.name }}</small>
                      <strong>Boleta N° {{ t.ticket_label }}</strong>
                    </div>
                    <app-chip [tone]="toneFor(t)">{{ labelFor(t) }}</app-chip>
                  </header>

                  <div class="nums">
                    @for (n of t.numbers; track n) {
                      <span class="num">{{ n }}</span>
                    }
                  </div>

                  <footer class="ticket__foot">
                    <small class="muted">
                      Sorteo final: <strong>{{ t.raffle.final_draw_date }}</strong>
                    </small>
                    <a [routerLink]="['/verify', t.ticket_code]" class="verify-link">
                      Verificar <span class="material-icons">arrow_forward</span>
                    </a>
                  </footer>
                </li>
              }
            </ul>
          }
        }
      </div>
    </main>

    <app-whatsapp-button />
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
      max-width: 600px; margin: 0 auto; width: 100%;
    }
    .brand {
      font-weight: 500; font-size: 15px; color: var(--text);
      text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
    }
    .brand strong { font-weight: 700; }

    .container {
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      padding: 0 var(--s-4) var(--s-7);
      display: grid;
      gap: var(--s-3);
    }

    .form { display: grid; gap: var(--s-3); }
    .alert {
      display: flex; align-items: center; gap: 8px;
      padding: var(--s-3);
      background: var(--danger-soft); color: var(--danger);
      border-radius: var(--r-md);
      font-size: 13px;
    }
    .footer-note {
      display: block; text-align: center;
      font-size: 12px; padding: var(--s-3) 0 0;
    }
    .footer-note a { color: var(--accent); }

    .results__head {
      display: flex; justify-content: space-between; align-items: center;
      gap: var(--s-3); flex-wrap: wrap;
    }
    .results__head h1 { font-size: 22px; margin: 0; }
    .link-btn {
      background: transparent; border: 0;
      color: var(--text-muted);
      cursor: pointer; font-size: 13px;
      display: inline-flex; align-items: center; gap: 4px;
    }
    .link-btn:hover { color: var(--accent); }
    .link-btn .material-icons { font-size: 16px; }
    .summary { margin: 0; font-size: 13px; }

    .empty {
      display: grid; place-items: center;
      gap: var(--s-2); padding: var(--s-5) 0; text-align: center;
    }
    .empty .material-icons { font-size: 56px; color: var(--text-faint); }
    .empty h2 { margin: 0; font-size: 18px; color: var(--text); }
    .empty p { margin: 0; }

    .tickets { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s-3); }
    .ticket {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-left: 4px solid var(--text-muted);
      border-radius: var(--r-lg);
      padding: var(--s-4);
      display: grid; gap: var(--s-3);
    }
    .ticket--paid { border-left-color: var(--accent); }
    .ticket--winner { border-left-color: #f5b400; background: rgba(245, 180, 0, 0.06); }
    .ticket__head { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); }
    .ticket__head small { display: block; font-size: 12px; }
    .ticket__head strong { display: block; font-size: 18px; color: var(--text); }

    .nums { display: flex; flex-wrap: wrap; gap: 6px; }
    .num {
      background: var(--accent); color: var(--accent-fg);
      padding: 6px 12px; border-radius: var(--r-full);
      font-weight: 700; font-size: 13px;
      font-variant-numeric: tabular-nums;
      min-width: 52px; text-align: center;
    }

    .ticket__foot {
      display: flex; justify-content: space-between; align-items: center;
      gap: var(--s-3); flex-wrap: wrap;
      padding-top: var(--s-2);
      border-top: 1px solid var(--border);
    }
    .verify-link {
      color: var(--accent); text-decoration: none;
      display: inline-flex; align-items: center; gap: 4px;
      font-weight: 600; font-size: 13px;
    }
    .verify-link .material-icons { font-size: 16px; }

    .muted { color: var(--text-muted); font-size: 13px; }
  `],
})
export class MyTicketsComponent {
  private readonly http = inject(HttpClient);

  phoneInput = '';
  loading = signal(false);
  error = signal<string | null>(null);
  data = signal<MyTicketsResponse | null>(null);

  search() {
    const phone = (this.phoneInput || '').trim();
    if (phone.length < 7) {
      this.error.set('Escribe un teléfono válido (al menos 7 dígitos).');
      return;
    }
    this.error.set(null);
    this.loading.set(true);

    this.http
      .get<MyTicketsResponse>(`${environment.apiUrl}/public/my-tickets`, {
        params: { phone },
      })
      .subscribe({
        next: (res) => {
          this.data.set(res);
          this.loading.set(false);
        },
        error: (e) => {
          this.error.set(
            e?.error?.detail ??
              (e?.status === 0
                ? 'No se pudo contactar al servidor. Verifica tu conexión.'
                : 'Error al buscar tus boletas.'),
          );
          this.loading.set(false);
        },
      });
  }

  reset() {
    this.data.set(null);
    this.error.set(null);
  }

  raffleCount(tickets: MyTicket[]): number {
    return new Set(tickets.map((t) => t.raffle.id)).size;
  }

  toneFor(t: MyTicket): 'accent' | 'winning' | 'warning' | 'default' {
    if (t.is_winner) return 'winning';
    if (t.is_paid) return 'accent';
    if (t.status === 'reserved' || t.status === 'pending_payment') return 'warning';
    return 'default';
  }

  labelFor(t: MyTicket): string {
    return ({
      paid: 'Pagada',
      winning: 'GANADORA 🏆',
      reserved: 'Reservada',
      pending_payment: 'Pago en revisión',
      available: 'Disponible',
      expired: 'Expirada',
    } as Record<string, string>)[t.status] ?? t.status;
  }
}
