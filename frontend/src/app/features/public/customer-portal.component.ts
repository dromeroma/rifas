import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import {
  CustomerSession, MyTicket, PublicSalesService,
} from '@core/services/public-sales.service';

const SESSION_KEY = 'boletera_customer_session';

/**
 * Portal cliente — /mi-cuenta
 *
 * Dos estados posibles:
 *   1. Sin sesión → pedimos email → enviamos magic link
 *   2. Con sesión → mostramos boletas + info + referral code
 *
 * Sesión: guardamos el objeto CustomerSession en localStorage bajo
 * 'boletera_customer_session'. Cuando entran con ?t=<token>, lo
 * intercambiamos por sesión vía POST /public/auth/consume.
 */
@Component({
  selector: 'app-customer-portal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">

      @if (loading()) {
        <div class="state">
          <div class="spinner"></div>
          <p>Cargando...</p>
        </div>
      }

      <!-- Estado 1: SIN sesión → pedimos email para magic link -->
      @else if (!session()) {
        <div class="card">
          <h1>🎟️ Mi cuenta</h1>
          <p class="muted">
            Ingresa el email con el que compraste tus boletas. Te enviaremos un
            link seguro para entrar.
          </p>

          @if (linkSent()) {
            <div class="alert alert--ok">
              <span class="material-icons">mark_email_read</span>
              <div>
                <strong>Revisa tu correo</strong>
                <p>Enviamos el link a <strong>{{ email }}</strong>. Expira en 15 minutos.</p>
              </div>
            </div>
          } @else {
            <form class="form" (ngSubmit)="requestLink()">
              <label class="field">
                <span>Correo electrónico</span>
                <input type="email" [(ngModel)]="email" name="email" required
                       placeholder="tu@email.com" />
              </label>
              <button type="submit" class="btn primary btn--lg" [disabled]="sending()">
                <span class="material-icons">send</span>
                {{ sending() ? 'Enviando...' : 'Enviar link de acceso' }}
              </button>
            </form>

            @if (error()) {
              <div class="alert alert--err">
                <span class="material-icons">error_outline</span>
                {{ error() }}
              </div>
            }
          }
        </div>
      }

      <!-- Estado 2: CON sesión → mostramos portal -->
      @else if (session(); as s) {
        <div class="portal">
          <header class="portal__head">
            <div>
              <h1>Hola, {{ s.full_name }} 👋</h1>
              @if (s.email) { <p class="muted">{{ s.email }}</p> }
            </div>
            <button class="btn ghost" (click)="logout()">
              <span class="material-icons">logout</span>
              Salir
            </button>
          </header>

          @if (s.referral_code) {
            <div class="card card--referral">
              <h2>🎁 Invita amigos</h2>
              <p>Comparte tu código y ambos ganan al comprar.</p>
              <div class="code-box">
                <strong>{{ s.referral_code }}</strong>
                <button class="btn ghost btn--sm" (click)="copyRef(s.referral_code!)">
                  <span class="material-icons">content_copy</span>
                  Copiar
                </button>
              </div>
            </div>
          }

          <div class="card">
            <h2>🎟️ Mis boletas</h2>

            @if (loadingTickets()) {
              <p class="muted">Cargando...</p>
            } @else if (!tickets().length) {
              <div class="empty">
                <p>Aún no tienes boletas. ¡Explora las rifas activas!</p>
              </div>
            } @else {
              <ul class="tickets">
                @for (t of tickets(); track t.ticket_id) {
                  <li class="ticket" [class.ticket--paid]="isPaid(t.status)">
                    <div>
                      <strong>#{{ t.number_label }}</strong>
                      <small>{{ t.raffle_name }}</small>
                    </div>
                    <div class="ticket__status">
                      <span class="chip chip--{{ (t.status || '').toLowerCase() }}">
                        {{ statusLabel(t.status) }}
                      </span>
                    </div>
                  </li>
                }
              </ul>
            }
          </div>
        </div>
      }
    </main>
  `,
  styles: [`
    :host {
      display: block;
      background: linear-gradient(180deg, #faf6ee 0%, #f0e5c8 100%);
      min-height: 100vh;
      color: #1a2942;
      font-family: 'Inter', system-ui, sans-serif;
    }
    .page { max-width: 700px; margin: 0 auto; padding: 40px 16px; }

    .state {
      text-align: center;
      padding: 60px 20px;
      color: #6b7280;
    }
    .spinner {
      display: inline-block;
      width: 40px; height: 40px;
      border: 3px solid rgba(26, 41, 66, 0.12);
      border-top-color: #c9a96e;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .card {
      background: #fff;
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.05);
      margin-bottom: 16px;
    }
    .card h1, .card h2 { margin: 0 0 8px; }
    .card h1 { font-size: 24px; }
    .card h2 { font-size: 18px; margin-top: 0; }
    .muted { color: #6b7280; font-size: 13px; margin: 4px 0; }

    .form { display: grid; gap: 12px; margin-top: 16px; }
    .field { display: grid; gap: 4px; font-size: 12px; }
    .field span { font-weight: 600; letter-spacing: 0.02em; color: #4b5563; text-transform: uppercase; }
    .field input {
      padding: 12px 14px;
      border: 1.5px solid rgba(26, 41, 66, 0.15);
      border-radius: 8px;
      font-size: 15px;
    }
    .field input:focus { outline: none; border-color: #1ec77b; }

    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      font-size: 14px;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn.primary { background: #1ec77b; color: #fff; }
    .btn.ghost { background: transparent; border-color: rgba(26, 41, 66, 0.2); color: #1a2942; }
    .btn--lg { padding: 14px 24px; justify-content: center; font-size: 15px; }
    .btn--sm { padding: 6px 12px; font-size: 12px; }
    .btn .material-icons { font-size: 18px; }

    .alert {
      display: flex; gap: 12px; align-items: flex-start;
      padding: 14px 16px; margin-top: 16px;
      border-radius: 10px;
      font-size: 13px;
    }
    .alert--ok { background: rgba(30, 199, 123, 0.1); color: #0b8a4a; border-left: 3px solid #1ec77b; }
    .alert--err { background: rgba(239, 68, 68, 0.1); color: #b91c1c; border-left: 3px solid #ef4444; }
    .alert p { margin: 4px 0 0; font-size: 12px; }

    .portal__head {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 20px;
      padding: 0 4px;
    }
    .portal__head h1 { margin: 0; font-size: 22px; }

    .card--referral { background: linear-gradient(135deg, rgba(30, 199, 123, 0.08), rgba(201, 169, 110, 0.08)); }
    .code-box {
      display: flex; justify-content: space-between; align-items: center;
      padding: 14px 18px;
      background: #fff;
      border-radius: 10px;
      border: 1.5px dashed rgba(30, 199, 123, 0.4);
      margin-top: 12px;
    }
    .code-box strong { font-family: 'Courier New', monospace; font-size: 20px; letter-spacing: 0.06em; }

    .tickets { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
    .ticket {
      display: flex; justify-content: space-between; align-items: center;
      padding: 14px 16px;
      background: #f8f1e3;
      border-radius: 10px;
      border-left: 4px solid rgba(26, 41, 66, 0.15);
    }
    .ticket--paid { border-left-color: #1ec77b; background: #e5f7ee; }
    .ticket strong { display: block; font-size: 18px; font-variant-numeric: tabular-nums; }
    .ticket small { display: block; color: #6b7280; font-size: 12px; }

    .chip {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .chip--paid, .chip--winning { background: #1ec77b; color: #fff; }
    .chip--reserved, .chip--pending_payment { background: #f59e0b; color: #fff; }
    .chip--available { background: rgba(26, 41, 66, 0.1); color: #1a2942; }

    .empty { text-align: center; padding: 32px 16px; color: #6b7280; }
  `],
})
export class CustomerPortalComponent implements OnInit {
  private readonly svc = inject(PublicSalesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  loading = signal(true);
  sending = signal(false);
  loadingTickets = signal(false);
  linkSent = signal(false);
  session = signal<CustomerSession | null>(null);
  tickets = signal<MyTicket[]>([]);
  error = signal<string | null>(null);
  email = '';

  ngOnInit(): void {
    // Si viene con ?t=<token>, consumirlo
    const token = this.route.snapshot.queryParamMap.get('t');
    if (token) {
      this.svc.consumeMagicLink(token).subscribe({
        next: (s) => {
          this.session.set(s);
          this.persistSession(s);
          this.router.navigate(['/mi-cuenta'], { replaceUrl: true });
          this.loadTickets(s.id);
        },
        error: (e) => {
          this.error.set(e?.error?.detail ?? 'Link inválido o expirado.');
          this.loading.set(false);
        },
      });
      return;
    }

    // Cargar sesión guardada
    const saved = this.readSavedSession();
    if (saved) {
      this.session.set(saved);
      this.loadTickets(saved.id);
    } else {
      this.loading.set(false);
    }
  }

  requestLink() {
    if (!this.email || this.sending()) return;
    this.sending.set(true);
    this.error.set(null);
    this.svc.requestMagicLink(this.email).subscribe({
      next: () => { this.sending.set(false); this.linkSent.set(true); },
      error: (e) => {
        this.sending.set(false);
        this.error.set(e?.error?.detail ?? 'No se pudo enviar el link');
      },
    });
  }

  loadTickets(customerId: number) {
    this.loadingTickets.set(true);
    this.loading.set(false);
    this.svc.myTickets(customerId).subscribe({
      next: (list) => { this.tickets.set(list); this.loadingTickets.set(false); },
      error: () => this.loadingTickets.set(false),
    });
  }

  logout() {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    this.session.set(null);
    this.tickets.set([]);
  }

  copyRef(code: string) {
    navigator.clipboard.writeText(code).catch(() => {});
  }

  isPaid(status: string): boolean {
    return status === 'PAID' || status === 'WINNING' || status === 'paid' || status === 'winning';
  }

  statusLabel(s: string): string {
    const map: Record<string, string> = {
      paid: 'Pagada', PAID: 'Pagada',
      winning: 'Ganadora', WINNING: 'Ganadora',
      reserved: 'Reservada', RESERVED: 'Reservada',
      pending_payment: 'Pendiente', PENDING_PAYMENT: 'Pendiente',
      partially_paid: 'Pago parcial', PARTIALLY_PAID: 'Pago parcial',
      available: 'Disponible', AVAILABLE: 'Disponible',
    };
    return map[s] || s;
  }

  private persistSession(s: CustomerSession) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
  }

  private readSavedSession(): CustomerSession | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
}
