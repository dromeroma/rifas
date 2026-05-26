import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { environment } from '@env/environment';

interface VerifyResp {
  valid: boolean;
  raffle: {
    id: number;
    name: string;
    final_draw_date: string;
    lottery_name: string | null;
  };
  ticket: {
    label: string;
    code: string;
    is_paid: boolean;
    is_winner: boolean;
    numbers: string[];
  };
}

/**
 * Atajo del admin disparado por el QR del desprendible físico.
 *
 * URL: `/admin/registrar-venta?code=<full_code>`
 *
 * Flujo:
 *  1. El admin recibe del vendedor el talón con el QR
 *  2. Escanea con la cámara del celular → este componente
 *  3. Identifica la rifa + la boleta y redirige al panel de la rifa con
 *     el ticket destacado para registrar cliente y confirmar pago.
 *
 * Si el `code` no existe o la app no puede resolverlo, muestra error.
 */
@Component({
  selector: 'app-register-sale-shortcut',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap">
      <header class="head">
        <span class="dot"></span>
        <strong>Boletera · Registrar venta</strong>
      </header>

      @if (loading()) {
        <div class="state">
          <div class="spinner"></div>
          <p>Identificando boleta...</p>
        </div>
      } @else if (error()) {
        <div class="state error">
          <span class="material-icons big">error_outline</span>
          <h2>No se pudo identificar la boleta</h2>
          <p>{{ error() }}</p>
          <a routerLink="/admin" class="btn ghost">Volver al panel</a>
        </div>
      } @else if (ticket(); as t) {
        <article class="card">
          <small class="kicker">Boleta del talón</small>
          <h1>BOL {{ t.label }}</h1>
          <p class="raffle">{{ raffleName() }}</p>

          @if (t.is_paid) {
            <div class="banner banner--ok">
              <span class="material-icons">check_circle</span>
              Esta boleta ya está pagada. Puedes verificar al cliente en el panel.
            </div>
          } @else {
            <div class="banner banner--info">
              <span class="material-icons">edit</span>
              Continúa al panel para registrar al cliente y confirmar el pago.
            </div>
          }

          <div class="info">
            <small class="muted">Código</small>
            <strong class="mono">{{ t.code }}</strong>
          </div>

          @if (t.numbers && t.numbers.length) {
            <div class="info">
              <small class="muted">Números asignados</small>
              <div class="nums">
                @for (n of t.numbers; track n) {
                  <span class="num">{{ n }}</span>
                }
              </div>
            </div>
          }

          <div class="cta">
            <a class="btn primary" (click)="goToRaffle()">
              <span class="material-icons">arrow_forward</span>
              Ir al panel de la rifa
            </a>
            <a routerLink="/admin" class="btn ghost">Cancelar</a>
          </div>
        </article>
      }
    </main>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--bg-base, #0a0e0c);
      color: var(--text, #e7ecea);
    }
    .wrap {
      max-width: 480px;
      margin: 0 auto;
      padding: 20px 16px 40px;
    }
    .head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-bottom: 24px;
      font-size: 13px;
    }
    .dot {
      width: 10px; height: 10px;
      background: #1ec77b;
      border-radius: 50%;
      box-shadow: 0 0 0 4px rgba(30, 199, 123, 0.18);
    }
    .state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 60px 20px;
      text-align: center;
    }
    .state.error h2 { margin: 0; }
    .state .big { font-size: 56px; color: #ef4444; }
    .spinner {
      width: 44px; height: 44px;
      border: 3px solid rgba(255,255,255,0.1);
      border-top-color: #1ec77b;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .card {
      padding: 28px 24px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
    }
    .kicker {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #d4a857;
    }
    .card h1 {
      font-size: 38px;
      font-weight: 900;
      margin: 6px 0 4px;
      color: #fff;
      letter-spacing: -0.02em;
    }
    .raffle {
      font-size: 15px;
      color: rgba(255,255,255,0.85);
      margin: 0 0 18px;
    }
    .banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 14px;
      border-radius: 10px;
      font-size: 13px;
      margin-bottom: 18px;
    }
    .banner--ok {
      background: rgba(30, 199, 123, 0.12);
      border: 1px solid rgba(30, 199, 123, 0.3);
      color: #1ec77b;
    }
    .banner--info {
      background: rgba(212, 168, 87, 0.12);
      border: 1px solid rgba(212, 168, 87, 0.3);
      color: #d4a857;
    }
    .info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-bottom: 12px;
      margin-bottom: 12px;
      border-bottom: 1px dashed rgba(255,255,255,0.1);
    }
    .info:last-of-type { border-bottom: 0; }
    .muted { color: rgba(255,255,255,0.55); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
    .mono { font-family: 'Courier New', monospace; font-size: 14px; }
    .nums {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }
    .num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px 10px;
      background: rgba(30, 199, 123, 0.12);
      border: 1px solid rgba(30, 199, 123, 0.3);
      color: #1ec77b;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      font-family: 'Courier New', monospace;
    }
    .cta {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 20px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 14px 22px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 14px;
      text-decoration: none;
      cursor: pointer;
      transition: background 0.15s, transform 0.1s;
      border: 1px solid transparent;
    }
    .btn.primary {
      background: #1ec77b;
      color: #0a0e0c;
    }
    .btn.primary:hover { background: #18b06e; }
    .btn.ghost {
      background: transparent;
      border-color: rgba(255,255,255,0.18);
      color: #fff;
    }
    .btn .material-icons { font-size: 20px; }
  `],
})
export class RegisterSaleShortcutComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly ticket = signal<VerifyResp['ticket'] | null>(null);
  readonly raffleName = signal<string>('');
  private raffleId = 0;
  private code = '';

  ngOnInit(): void {
    const code = this.route.snapshot.queryParamMap.get('code');
    if (!code) {
      this.error.set('Falta el código de la boleta en la URL.');
      this.loading.set(false);
      return;
    }
    this.code = code;

    this.http.get<VerifyResp>(`${environment.apiUrl}/verify/${encodeURIComponent(code)}`).subscribe({
      next: (r) => {
        if (!r.valid) {
          this.error.set('Boleta no encontrada en el sistema.');
          this.loading.set(false);
          return;
        }
        this.ticket.set(r.ticket);
        this.raffleName.set(r.raffle.name);
        this.raffleId = r.raffle.id;
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No encontramos la boleta. Verifica que el código del talón esté completo.');
        this.loading.set(false);
      },
    });
  }

  /** Navega al panel de la rifa con el código de la boleta para destacarla. */
  goToRaffle(): void {
    if (!this.raffleId) return;
    this.router.navigate(['/admin/raffles', this.raffleId], {
      queryParams: { focus: this.code },
    });
  }
}
