import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  AvailableTicket,
  PublicRaffleOverview,
  PublicSalesService,
} from '@core/services/public-sales.service';

/**
 * Portal PÚBLICO de compra online de boletas.
 *
 * Ruta: /rifa/:id/comprar
 *
 * Flujo:
 *   1. Muestra info de la rifa (nombre, premios, %vendido, fecha si aplica)
 *   2. Grid de boletas disponibles (solo las que NO tienen seller humano)
 *   3. Cliente selecciona 1-10 boletas (chips visuales verdes = selección)
 *   4. Formulario mínimo: cédula + nombre + email + celular
 *   5. Elige "Pagar por Wompi" o "Transferir manualmente"
 *   6. Redirect a Wompi (o página de subida de comprobante)
 *
 * Anti-fraude: máx 10 boletas seleccionables. El backend valida
 * disponibilidad al procesar el checkout (evita race conditions).
 */
@Component({
  selector: 'app-public-purchase',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      @if (loading()) {
        <section class="state">
          <div class="spinner"></div>
          <p>Cargando rifa...</p>
        </section>
      } @else if (error()) {
        <section class="state state--err">
          <h2>Rifa no encontrada</h2>
          <p>{{ error() }}</p>
          <a routerLink="/" class="btn">Volver al inicio</a>
        </section>
      } @else if (overview(); as r) {

        <!-- HEADER de la rifa -->
        <header class="hero">
          <div class="hero__inner">
            <div class="badge">🎟️ Rifa activa</div>
            <h1>{{ r.name }}</h1>
            @if (r.description) { <p class="hero__desc">{{ r.description }}</p> }

            @if (r.public_welcome_message) {
              <div class="welcome">
                <span class="material-icons">campaign</span>
                <p>{{ r.public_welcome_message }}</p>
              </div>
            }

            <div class="hero__stats">
              <div class="stat">
                <strong>{{ r.sold_pct }}%</strong>
                <small>vendido</small>
              </div>
              <div class="stat">
                <strong>\${{ formatNumber(r.ticket_price) }}</strong>
                <small>por boleta</small>
              </div>
              @if (r.show_draw_date && r.final_draw_date) {
                <div class="stat">
                  <strong>{{ formatDate(r.final_draw_date) }}</strong>
                  <small>sorteo</small>
                </div>
              }
            </div>

            <div class="progress">
              <div class="progress__bar" [style.width.%]="r.sold_pct"></div>
            </div>
          </div>
        </header>

        <!-- PREMIOS -->
        @if (r.prizes.length) {
          <section class="prizes">
            <h2>🏆 Premios</h2>
            <ul>
              @for (p of r.prizes; track p.position) {
                <li>
                  <strong>{{ p.name }}</strong>
                  @if (p.draw_date) { <span class="muted">· sorteo {{ formatDate(p.draw_date) }}</span> }
                </li>
              }
            </ul>
          </section>
        }

        <!-- GRID DE BOLETAS -->
        <section class="picker">
          <div class="picker__head">
            <h2>Elige tu boleta</h2>
            <div class="picker__legend">
              <span class="chip chip--free">Disponible</span>
              <span class="chip chip--sel">Seleccionada</span>
            </div>
          </div>

          @if (loadingTickets()) {
            <p class="muted">Cargando boletas disponibles...</p>
          } @else if (!available().length) {
            <div class="empty">
              <p><strong>No hay boletas disponibles públicamente.</strong></p>
              <p class="muted">Puede que todas estén asignadas a vendedores o ya se hayan vendido.</p>
            </div>
          } @else {
            <div class="grid">
              @for (t of available(); track t.id) {
                <button type="button"
                        class="cell"
                        [class.cell--selected]="isSelected(t.id)"
                        (click)="toggle(t.id)">
                  {{ t.number_label }}
                </button>
              }
            </div>
          }

          @if (selected().size > 0) {
            <div class="summary">
              <div>
                <strong>{{ selected().size }}</strong> boleta(s) seleccionada(s)
                — total <strong>\${{ formatNumber(totalPrice()) }}</strong>
              </div>
              <button class="btn primary" (click)="openCheckout()">Continuar al pago</button>
            </div>
          }
        </section>

      }

      <!-- MODAL CHECKOUT -->
      @if (checkoutOpen()) {
        <div class="modal" (click)="closeCheckout()">
          <div class="modal__card" (click)="$event.stopPropagation()">
            <h2>Completar tu compra</h2>
            <p class="muted">
              Boletas: <strong>{{ selectedLabels() }}</strong>
              — total <strong>\${{ formatNumber(totalPrice()) }}</strong>
            </p>

            <form class="form" (ngSubmit)="submit()">
              <label class="field">
                <span>Cédula</span>
                <input type="text" [(ngModel)]="form.customer_document" name="doc"
                       required minlength="4" maxlength="30" inputmode="numeric" />
              </label>

              <label class="field">
                <span>Nombre completo</span>
                <input type="text" [(ngModel)]="form.customer_name" name="name"
                       required minlength="2" maxlength="150" />
              </label>

              <label class="field">
                <span>Email</span>
                <input type="email" [(ngModel)]="form.customer_email" name="email" required />
              </label>

              <label class="field">
                <span>Celular (WhatsApp)</span>
                <input type="tel" [(ngModel)]="form.customer_phone" name="phone"
                       required minlength="7" placeholder="3001234567" />
              </label>

              <label class="field">
                <span>Ciudad (opcional)</span>
                <input type="text" [(ngModel)]="form.customer_city" name="city" maxlength="80" />
              </label>

              @if (overview()?.enable_online_purchase) {
                <button type="submit" class="btn primary btn--lg" [disabled]="submitting()">
                  <span class="material-icons">credit_card</span>
                  {{ submitting() ? 'Redirigiendo...' : 'Pagar con Wompi' }}
                </button>
                <small class="muted">Nequi, PSE, Bancolombia, tarjeta — seguro y rápido.</small>
              }

              @if (overview()?.enable_manual_transfer) {
                <div class="or">— o —</div>
                <button type="button" class="btn ghost" (click)="switchManual()">
                  <span class="material-icons">receipt_long</span>
                  Ya hice la transferencia — subir comprobante
                </button>
              }
            </form>

            @if (submitError()) {
              <div class="alert">
                <span class="material-icons">error_outline</span>
                {{ submitError() }}
              </div>
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
    .page { max-width: 900px; margin: 0 auto; padding: 24px 16px 60px; }

    .state {
      text-align: center;
      padding: 80px 20px;
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

    .hero {
      background: linear-gradient(135deg, #1a2942 0%, #2a3a5a 100%);
      color: #f8f1e3;
      border-radius: 16px;
      padding: 32px 24px;
      margin-bottom: 24px;
      box-shadow: 0 10px 40px rgba(26, 41, 66, 0.15);
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      background: rgba(30, 199, 123, 0.2);
      color: #7fecb3;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 16px;
    }
    .hero h1 {
      margin: 0 0 8px;
      font-size: 28px;
      line-height: 1.15;
      color: #fff;
    }
    .hero__desc { margin: 0 0 20px; color: rgba(248, 241, 227, 0.85); font-size: 14px; }

    .welcome {
      display: flex; gap: 12px; align-items: flex-start;
      padding: 12px 16px; margin: 12px 0 20px;
      background: rgba(201, 169, 110, 0.15);
      border-left: 3px solid #c9a96e;
      border-radius: 8px;
    }
    .welcome .material-icons { color: #c9a96e; }
    .welcome p { margin: 0; font-size: 13px; }

    .hero__stats { display: flex; gap: 16px; margin: 20px 0 12px; flex-wrap: wrap; }
    .stat { flex: 1; min-width: 100px; }
    .stat strong { display: block; font-size: 24px; color: #fff; }
    .stat small { color: rgba(248, 241, 227, 0.65); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }

    .progress {
      height: 8px;
      background: rgba(255,255,255,0.08);
      border-radius: 999px;
      overflow: hidden;
    }
    .progress__bar {
      height: 100%;
      background: linear-gradient(90deg, #1ec77b 0%, #c9a96e 100%);
      transition: width 0.5s ease;
    }

    .prizes {
      background: #fff;
      border-radius: 16px;
      padding: 20px 24px;
      margin-bottom: 24px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.05);
    }
    .prizes h2 { margin: 0 0 12px; font-size: 18px; }
    .prizes ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
    .prizes li { font-size: 14px; }

    .picker {
      background: #fff;
      border-radius: 16px;
      padding: 20px 24px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.05);
    }
    .picker__head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .picker__head h2 { margin: 0; font-size: 18px; }
    .picker__legend { display: flex; gap: 8px; }
    .chip {
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
    }
    .chip--free { background: #e5f7ee; color: #0b8a4a; border: 1px solid rgba(30, 199, 123, 0.35); }
    .chip--sel { background: #1ec77b; color: #fff; }

    .empty {
      text-align: center;
      padding: 40px 20px;
      color: #6b7280;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
      gap: 8px;
      margin-bottom: 20px;
    }
    .cell {
      padding: 12px 4px;
      background: #f8f1e3;
      border: 1.5px solid rgba(26, 41, 66, 0.15);
      border-radius: 8px;
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      font-size: 15px;
      color: #1a2942;
      cursor: pointer;
      transition: all 0.15s;
      font-variant-numeric: tabular-nums;
    }
    .cell:hover { background: #fff; border-color: #c9a96e; transform: translateY(-1px); }
    .cell--selected {
      background: #1ec77b !important;
      color: #fff !important;
      border-color: #0b8a4a !important;
      box-shadow: 0 4px 12px rgba(30, 199, 123, 0.35);
    }

    .summary {
      display: flex; justify-content: space-between; align-items: center;
      padding: 16px 20px; margin-top: 16px;
      background: #f8f1e3;
      border-radius: 12px;
      font-size: 14px;
      flex-wrap: wrap; gap: 12px;
    }

    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: transform 0.1s, box-shadow 0.15s;
      text-decoration: none;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn.primary { background: #1ec77b; color: #fff; }
    .btn.primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(30, 199, 123, 0.3); }
    .btn.ghost { background: transparent; border-color: rgba(26, 41, 66, 0.2); color: #1a2942; }
    .btn.ghost:hover:not(:disabled) { background: rgba(26, 41, 66, 0.05); }
    .btn--lg { padding: 14px 24px; font-size: 15px; justify-content: center; }
    .btn .material-icons { font-size: 18px; }

    /* Modal */
    .modal {
      position: fixed;
      inset: 0;
      background: rgba(10, 14, 12, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      z-index: 100;
      animation: fadeIn 0.15s;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .modal__card {
      background: #fff;
      border-radius: 16px;
      padding: 24px;
      max-width: 420px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .modal__card h2 { margin: 0 0 4px; font-size: 20px; }

    .form { display: grid; gap: 12px; margin-top: 16px; }
    .field { display: grid; gap: 4px; font-size: 12px; }
    .field span { font-weight: 600; letter-spacing: 0.02em; color: #4b5563; text-transform: uppercase; }
    .field input {
      padding: 12px 14px;
      border: 1.5px solid rgba(26, 41, 66, 0.15);
      border-radius: 8px;
      font-size: 15px;
      color: #1a2942;
      transition: border-color 0.15s;
    }
    .field input:focus { outline: none; border-color: #1ec77b; }

    .or { text-align: center; margin: 8px 0; color: #6b7280; font-size: 12px; }
    .muted { color: #6b7280; font-size: 12px; margin: 4px 0 0; }

    .alert {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 14px; margin-top: 12px;
      background: rgba(239, 68, 68, 0.1);
      color: #b91c1c;
      border-radius: 8px;
      font-size: 13px;
    }
  `],
})
export class PublicPurchaseComponent implements OnInit {
  private readonly svc = inject(PublicSalesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  loading = signal(true);
  loadingTickets = signal(false);
  error = signal<string | null>(null);
  overview = signal<PublicRaffleOverview | null>(null);
  available = signal<AvailableTicket[]>([]);
  selected = signal<Set<number>>(new Set());

  checkoutOpen = signal(false);
  submitting = signal(false);
  submitError = signal<string | null>(null);

  form = {
    customer_document: '',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_city: '',
  };

  private raffleId = 0;

  totalPrice = computed(() => {
    const r = this.overview();
    if (!r) return 0;
    return r.ticket_price * this.selected().size;
  });

  selectedLabels = computed(() => {
    const set = this.selected();
    return this.available()
      .filter((t) => set.has(t.id))
      .map((t) => t.number_label)
      .join(', ');
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) {
      this.error.set('URL inválida');
      this.loading.set(false);
      return;
    }
    this.raffleId = id;

    // Guardar referral code si vino por queryParam
    const ref = this.route.snapshot.queryParamMap.get('ref');
    if (ref) {
      try { localStorage.setItem('boletera_referral_code', ref); } catch {}
    }

    this.svc.overview(id).subscribe({
      next: (r) => {
        this.overview.set(r);
        this.loading.set(false);
        this.loadAvailable();
      },
      error: (e) => {
        this.error.set(e?.error?.detail ?? 'No se pudo cargar la rifa');
        this.loading.set(false);
      },
    });
  }

  loadAvailable() {
    this.loadingTickets.set(true);
    this.svc.availableTickets(this.raffleId).subscribe({
      next: (list) => { this.available.set(list); this.loadingTickets.set(false); },
      error: () => this.loadingTickets.set(false),
    });
  }

  isSelected(id: number): boolean { return this.selected().has(id); }

  toggle(id: number) {
    const set = new Set(this.selected());
    if (set.has(id)) {
      set.delete(id);
    } else {
      if (set.size >= 10) return; // cap UX
      set.add(id);
    }
    this.selected.set(set);
  }

  openCheckout() {
    if (!this.selected().size) return;
    this.submitError.set(null);
    this.checkoutOpen.set(true);
  }

  closeCheckout() { this.checkoutOpen.set(false); }

  submit() {
    if (this.submitting()) return;
    this.submitError.set(null);
    this.submitting.set(true);

    let referralCode: string | undefined;
    try {
      referralCode = localStorage.getItem('boletera_referral_code') || undefined;
    } catch {}

    const ticket_ids = Array.from(this.selected());
    this.svc.checkout(this.raffleId, {
      ticket_ids,
      customer_document: this.form.customer_document,
      customer_name: this.form.customer_name,
      customer_email: this.form.customer_email,
      customer_phone: this.form.customer_phone,
      customer_city: this.form.customer_city || undefined,
      referral_code: referralCode,
    }).subscribe({
      next: (resp) => {
        // Guarda datos para la página de resultado
        try {
          localStorage.setItem(`boletera_tx_${resp.reference}`, JSON.stringify({
            ticket_labels: resp.ticket_labels,
            total_cents: resp.total_amount_cents,
            expires_at: resp.reservation_expires_at,
            raffle_id: this.raffleId,
          }));
        } catch {}

        if (resp.checkout_url) {
          window.location.href = resp.checkout_url;
        } else {
          this.router.navigate(['/rifa', this.raffleId, 'pago', resp.reference]);
        }
      },
      error: (e) => {
        this.submitError.set(e?.error?.detail ?? 'No se pudo iniciar el checkout');
        this.submitting.set(false);
      },
    });
  }

  switchManual() {
    // Por ahora navegamos a página de transferencia manual (TODO)
    // La implementación completa del upload de comprobante requiere Supabase Storage
    alert('Transferencia manual: pronto disponible. Contacta al organizador por WhatsApp mientras tanto.');
  }

  formatNumber(n: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
  }
}
