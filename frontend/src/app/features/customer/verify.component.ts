import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { environment } from '@env/environment';
import { ButtonComponent, CardComponent, ChipComponent, InputComponent, ThemeToggleComponent } from '@shared/ui';

interface VerifyResponse {
  valid: boolean;
  raffle: {
    name: string;
    final_draw_date: string;
    lottery_name?: string | null;
    responsible_name?: string | null;
    responsible_phone?: string | null;
    responsible_email?: string | null;
    terms?: string | null;
    primary_color?: string | null;
  };
  ticket: {
    label: string;
    code: string;
    is_paid: boolean;
    is_winner: boolean;
    numbers: string[];
  };
  prizes: { name: string; draw_date: string; winning_number: string | null }[];
}

@Component({
  selector: 'app-verify',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    ButtonComponent, CardComponent, ChipComponent, InputComponent, ThemeToggleComponent,
  ],
  template: `
    <main class="verify">
      <header class="verify__top">
        <a routerLink="/" class="brand" aria-label="Inicio">🎟️ <strong>Boletera</strong></a>
        <app-theme-toggle />
      </header>

      <div class="verify__container">

        @if (showForm()) {
          <app-card title="Verificar boleta" subtitle="Ingresa el código que aparece en tu boleta">
            <form class="form" (ngSubmit)="submitForm()">
              <app-input
                label="Código de boleta"
                placeholder="Ej: 0WL-7JE-2TF"
                icon="qr_code_2"
                [(ngModel)]="codeInput"
                name="code"
                autocomplete="off"
                hint="El código completo está en tu boleta (debajo del QR)."
              />
              @if (formError()) {
                <div class="alert">
                  <span class="material-icons">error_outline</span>
                  {{ formError() }}
                </div>
              }
              <app-button type="submit" variant="primary" size="lg" [full]="true">
                Verificar boleta
              </app-button>
            </form>
            <small class="footer-note muted">
              También puedes escanear el QR de tu boleta para verificarla automáticamente.
            </small>
            <small class="footer-note muted">
              ¿Quieres ver TODAS tus boletas? Entra a
              <a routerLink="/mi-boleta">/mi-boleta</a> con tu teléfono.
            </small>
          </app-card>
        }

        @if (!showForm() && loading()) {
          <div class="state">
            <div class="spinner"></div>
            <p>Verificando boleta...</p>
            <small class="muted">Código: {{ code() }}</small>
          </div>
        }

        @if (!showForm() && !loading() && error()) {
          <app-card>
            <div class="state state--err">
              <span class="material-icons big">cancel</span>
              <h2>Boleta no encontrada</h2>
              <p class="muted">{{ error() }}</p>
              <small class="muted">Código consultado: <strong>{{ code() }}</strong></small>
              <app-button variant="secondary" icon="search" (click)="backToForm()">
                Probar con otro código
              </app-button>
            </div>
          </app-card>
        }

        @if (!showForm() && !loading() && !error() && data(); as d) {
          <!-- ============ STATUS HERO ============ -->
          <div class="hero" [class.hero--paid]="d.ticket.is_paid" [class.hero--winner]="d.ticket.is_winner">
            <span class="material-icons hero__icon">
              {{ d.ticket.is_winner ? 'emoji_events' : d.ticket.is_paid ? 'verified' : 'pending' }}
            </span>
            <div>
              <small>{{ d.ticket.is_winner ? 'BOLETA GANADORA' : d.ticket.is_paid ? 'BOLETA PAGADA' : 'BOLETA RESERVADA' }}</small>
              <h2>Boleta N° {{ d.ticket.label }}</h2>
              <small class="muted">Código: <code>{{ d.ticket.code }}</code></small>
            </div>
          </div>

          <!-- ============ RIFA ============ -->
          <app-card>
            <div class="raffle">
              <small class="muted label">Rifa</small>
              <h1>{{ d.raffle.name }}</h1>
              @if (d.raffle.lottery_name) {
                <p class="lottery">
                  <span class="material-icons">casino</span>
                  Juega con: <strong>{{ d.raffle.lottery_name }}</strong>
                </p>
              }
              <p class="muted">Sorteo final: <strong>{{ d.raffle.final_draw_date }}</strong></p>
            </div>
          </app-card>

          <!-- ============ NÚMEROS ============ -->
          <app-card title="Números asignados" subtitle="20 números únicos">
            <div class="nums">
              @for (n of d.ticket.numbers; track n) {
                <span class="num">{{ n }}</span>
              }
            </div>
          </app-card>

          <!-- ============ PREMIOS ============ -->
          <app-card title="Premios y fechas de sorteo">
            <ul class="prizes">
              @for (p of d.prizes; track p.name) {
                <li>
                  <div class="prize__info">
                    <strong>{{ p.name }}</strong>
                    <small class="muted">{{ p.draw_date }}</small>
                  </div>
                  @if (p.winning_number) {
                    <app-chip tone="winning">Ganador: {{ p.winning_number }}</app-chip>
                  } @else {
                    <app-chip tone="default">Pendiente</app-chip>
                  }
                </li>
              }
            </ul>
          </app-card>

          <!-- ============ RESPONSABLE ============ -->
          @if (d.raffle.responsible_name || d.raffle.responsible_phone) {
            <app-card title="Responsable de la rifa">
              <div class="responsible">
                @if (d.raffle.responsible_name) {
                  <div class="resp__row">
                    <span class="material-icons">person</span>
                    <span>{{ d.raffle.responsible_name }}</span>
                  </div>
                }
                @if (d.raffle.responsible_phone) {
                  <a class="resp__row resp__row--link"
                     [href]="'tel:' + d.raffle.responsible_phone">
                    <span class="material-icons">phone</span>
                    <span>{{ d.raffle.responsible_phone }}</span>
                  </a>
                }
                @if (d.raffle.responsible_email) {
                  <a class="resp__row resp__row--link"
                     [href]="'mailto:' + d.raffle.responsible_email">
                    <span class="material-icons">mail</span>
                    <span>{{ d.raffle.responsible_email }}</span>
                  </a>
                }
              </div>
            </app-card>
          }

          @if (d.raffle.terms) {
            <app-card>
              <small class="muted label">Términos</small>
              <p class="terms">{{ d.raffle.terms }}</p>
            </app-card>
          }

          <small class="footer-note muted">
            Verifica autenticidad escaneando el QR de tu boleta.
            Si tienes dudas, contacta al responsable.
          </small>
        }
      </div>
    </main>
  `,
  styles: [`
    .verify {
      min-height: 100dvh;
      background: var(--bg-base);
      display: grid;
      grid-template-rows: auto 1fr;
    }
    .verify__top {
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
    .brand:hover { color: var(--accent); }

    .verify__container {
      width: 100%;
      max-width: 540px;
      margin: 0 auto;
      padding: 0 var(--s-4) var(--s-7);
      display: grid;
      gap: var(--s-3);
    }

    /* ============ STATES ============ */
    .state {
      display: grid; place-items: center; gap: var(--s-3);
      padding: var(--s-7) var(--s-4);
      text-align: center;
      color: var(--text-muted);
    }
    .state.state--err { color: var(--danger); padding: var(--s-5) 0; }
    .state .big { font-size: 56px; }
    .state h2 { color: var(--text); margin: 0; }
    .state p { margin: 0; }

    .spinner {
      width: 36px; height: 36px;
      border: 3px solid var(--bg-hover);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ============ HERO ============ */
    .hero {
      display: flex; align-items: center; gap: var(--s-3);
      padding: var(--s-4);
      border-radius: var(--r-lg);
      background: var(--warning-soft);
      color: var(--warning);
      border-left: 4px solid var(--warning);
    }
    .hero--paid { background: var(--accent-soft); color: var(--accent); border-left-color: var(--accent); }
    .hero--winner { background: rgba(245, 180, 0, 0.18); color: #b8860b; border-left-color: #f5b400; }
    .hero__icon { font-size: 44px !important; }
    .hero div { display: grid; gap: 2px; }
    .hero small { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
    .hero h2 { color: var(--text); font-size: 22px; margin: 0; }
    .hero code { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); }

    /* ============ RIFA ============ */
    .raffle .label { display: block; margin-bottom: 4px; }
    .raffle h1 { margin: 0 0 8px; font-size: 22px; }
    .lottery {
      display: flex; align-items: center; gap: 6px;
      color: var(--text); font-size: 14px;
      margin: 8px 0;
    }
    .lottery .material-icons { color: var(--accent); font-size: 18px; }
    .raffle .muted { font-size: 13px; }

    /* ============ NUMBERS ============ */
    .nums {
      display: flex; flex-wrap: wrap; gap: 6px;
    }
    .num {
      background: var(--accent);
      color: var(--accent-fg);
      padding: 8px 14px;
      border-radius: var(--r-full);
      font-weight: 700;
      font-size: 14px;
      font-variant-numeric: tabular-nums;
      min-width: 56px;
      text-align: center;
    }

    /* ============ PRIZES ============ */
    .prizes { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s-2); }
    .prizes li {
      display: flex; justify-content: space-between; align-items: center;
      padding: var(--s-3);
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      gap: var(--s-3);
    }
    .prize__info { display: grid; gap: 2px; min-width: 0; }
    .prize__info strong { font-size: 14px; color: var(--text); }
    .prize__info small { font-size: 12px; }

    /* ============ RESPONSABLE ============ */
    .responsible { display: grid; gap: var(--s-2); }
    .resp__row {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 12px;
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      color: var(--text);
      text-decoration: none;
      font-size: 14px;
    }
    .resp__row--link:hover { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
    .resp__row .material-icons { color: var(--text-muted); font-size: 18px; }
    .resp__row--link:hover .material-icons { color: var(--accent); }

    .label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; }
    .terms { font-size: 13px; color: var(--text); line-height: 1.55; margin: 6px 0 0; }

    .footer-note {
      display: block; text-align: center;
      font-size: 12px;
      padding: var(--s-4) 0;
    }

    .form { display: grid; gap: var(--s-3); }
    .alert {
      display: flex; align-items: center; gap: 8px;
      padding: var(--s-3);
      background: var(--danger-soft); color: var(--danger);
      border-radius: var(--r-md);
      font-size: 13px;
    }
  `],
})
export class VerifyComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);

  loading = signal(false);
  error = signal<string | null>(null);
  data = signal<VerifyResponse | null>(null);
  code = signal<string>('');
  showForm = signal<boolean>(true);
  formError = signal<string | null>(null);
  codeInput = '';

  ngOnInit(): void {
    const code = this.route.snapshot.paramMap.get('code')?.trim() ?? '';
    if (!code) {
      this.showForm.set(true);
      return;
    }
    this.verify(code);
  }

  private verify(code: string) {
    this.showForm.set(false);
    this.loading.set(true);
    this.error.set(null);
    this.code.set(code);
    this.data.set(null);

    this.http
      .get<VerifyResponse>(`${environment.apiUrl}/verify/${encodeURIComponent(code)}`)
      .subscribe({
        next: (d) => {
          this.data.set(d);
          this.loading.set(false);
        },
        error: (e) => {
          const detail =
            e?.error?.detail ??
            (e?.status === 0
              ? 'No se pudo contactar al servidor. Verifica tu conexión.'
              : `Error ${e?.status ?? '?'} al consultar la boleta.`);
          this.error.set(detail);
          this.loading.set(false);
        },
      });
  }

  submitForm() {
    const raw = (this.codeInput || '').trim();
    if (!raw) {
      this.formError.set('Escribe el código de tu boleta.');
      return;
    }
    this.formError.set(null);
    // Normaliza: a mayúsculas y quita espacios. Mantiene guiones del formato XXX-XXX-XXX.
    const code = raw.toUpperCase().replace(/\s+/g, '');
    this.router.navigate(['/verify', code]);
    this.verify(code);
  }

  backToForm() {
    this.codeInput = '';
    this.formError.set(null);
    this.error.set(null);
    this.data.set(null);
    this.showForm.set(true);
    this.router.navigate(['/verify']);
  }
}
