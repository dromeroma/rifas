import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy, Component, OnInit, computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';

import { environment } from '@env/environment';

interface Prize {
  position: number;
  name: string;
  description: string | null;
  estimated_value: number | null;
  draw_date: string;
  image_url: string | null;
  winning_number: string | null;
}

interface PromoRaffle {
  id: number;
  name: string;
  description: string | null;
  lottery_name: string | null;
  primary_color: string | null;
  logo_url: string | null;
  final_draw_date: string;
  days_to_final_draw: number;
  total_tickets: number;
  prizes: Prize[];
  responsible_name: string | null;
  responsible_phone: string | null;
  responsible_email: string | null;
  terms: string | null;
}

interface VerifyResponse {
  valid: boolean;
  ticket: {
    label: string;
    code: string;
    is_paid: boolean;
    is_winner: boolean;
    numbers: string[];
  };
}

interface VerifyView {
  found: boolean;
  number_label?: string;
  numbers?: string[];
  is_paid?: boolean;
  is_winner?: boolean;
  message?: string;
}

/**
 * Sitio promocional premium de una rifa. Branding Mundial 2026 sutil.
 *
 * Ruta: `/r/:id` (alias corto para QR físico).
 * Opcional ?b=<code> auto-verifica una boleta al cargar.
 */
@Component({
  selector: 'app-raffle-promo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <!-- Patrón hexagonal sutil de fondo (geometría del balón) -->
      <div class="hex-bg" aria-hidden="true"></div>

      <header class="topbar">
        <div class="brand">
          <span class="brand__dot"></span>
          <strong>Boletera</strong>
        </div>
        <span class="badge">⚽ Mundial 2026</span>
      </header>

      @if (loading()) {
        <section class="state">
          <div class="spinner"></div>
          <p>Cargando rifa...</p>
        </section>
      } @else if (error()) {
        <section class="state">
          <span class="material-icons big">error_outline</span>
          <h2>Rifa no encontrada</h2>
          <p class="muted">{{ error() }}</p>
        </section>
      } @else if (data(); as d) {
        <!-- HERO -->
        <section class="hero">
          <div class="hero__inner">
            <div class="hero__text">
              <small class="kicker">Vibra con la pasión mundialista</small>
              <h1>{{ d.name }}</h1>
              @if (d.lottery_name) {
                <p class="lottery">
                  Sorteamos con la lotería <strong>{{ d.lottery_name }}</strong>
                </p>
              }
              <div class="counters">
                <div class="counter">
                  <strong>{{ d.days_to_final_draw }}</strong>
                  <small>{{ d.days_to_final_draw === 1 ? 'día' : 'días' }} al sorteo</small>
                </div>
                @if (totalPrizeValue() > 0) {
                  <div class="counter accent">
                    <strong>{{ '$' + fmt(totalPrizeValue()) }}</strong>
                    <small>en premios</small>
                  </div>
                }
                <div class="counter">
                  <strong>{{ d.prizes.length }}</strong>
                  <small>{{ d.prizes.length === 1 ? 'premio' : 'premios' }}</small>
                </div>
              </div>
            </div>

            <!-- TV genérico SVG (si no hay image_url del premio principal) -->
            <div class="hero__visual">
              @if (heroImage()) {
                <img [src]="heroImage()" alt="{{ d.prizes[0]?.name || 'Premio' }}" />
              } @else {
                <svg class="tv-svg" viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <!-- Marco -->
                  <rect x="14" y="12" width="292" height="170" rx="10" ry="10" fill="#0a0e0c" />
                  <rect x="20" y="18" width="280" height="158" rx="6" ry="6"
                        fill="url(#scrGrad)" stroke="#1f2937" stroke-width="0.5" />
                  <!-- Resplandor pantalla -->
                  <ellipse cx="120" cy="70" rx="60" ry="30" fill="rgba(255,255,255,0.04)" />
                  <!-- Base -->
                  <rect x="140" y="182" width="40" height="6" fill="#0a0e0c" />
                  <polygon points="100,196 220,196 200,206 120,206" fill="#0a0e0c" />
                  <defs>
                    <linearGradient id="scrGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stop-color="#0d1b2a" />
                      <stop offset="60%" stop-color="#070d14" />
                      <stop offset="100%" stop-color="#020409" />
                    </linearGradient>
                  </defs>
                </svg>
              }
            </div>
          </div>
        </section>

        <!-- VERIFICACIÓN (si hay ?b=) -->
        @if (verifyResult(); as v) {
          <section class="verify-card" [class.win]="v.is_winner">
            @if (v.found) {
              <span class="material-icons">{{ v.is_winner ? 'emoji_events' : 'verified' }}</span>
              <div>
                <strong>Tu boleta BOL {{ v.number_label }} {{ v.is_winner ? 'es GANADORA 🎉' : (v.is_paid ? 'está pagada' : 'está activa') }}</strong>
                @if (v.numbers && v.numbers.length) {
                  <small class="nums">Números: {{ v.numbers.join(' · ') }}</small>
                }
              </div>
            } @else {
              <span class="material-icons">help_outline</span>
              <div>
                <strong>Boleta no encontrada</strong>
                <small>{{ v.message || 'Verifica el código con tu vendedor.' }}</small>
              </div>
            }
          </section>
        }

        <!-- PREMIOS -->
        <section class="block">
          <h2 class="block__title">Premios</h2>
          <div class="prizes">
            @for (p of d.prizes; track p.position) {
              <article class="prize">
                <div class="prize__pos">{{ p.position }}</div>
                @if (p.image_url) {
                  <img class="prize__img" [src]="p.image_url" alt="{{ p.name }}" />
                } @else {
                  <div class="prize__img prize__img--placeholder">
                    <span class="material-icons">card_giftcard</span>
                  </div>
                }
                <div class="prize__body">
                  <strong>{{ p.name }}</strong>
                  @if (p.estimated_value) {
                    <small class="value">{{ '$' + fmt(p.estimated_value) }}</small>
                  }
                  <small class="date">Sorteo: {{ formatDate(p.draw_date) }}</small>
                </div>
              </article>
            }
          </div>
        </section>

        <!-- CÓMO FUNCIONA -->
        <section class="block">
          <h2 class="block__title">Cómo funciona</h2>
          <ol class="steps">
            <li>
              <span class="steps__num">1</span>
              <div>
                <strong>Compra tu boleta</strong>
                <small>Acércate a un vendedor autorizado o contacta al organizador.</small>
              </div>
            </li>
            <li>
              <span class="steps__num">2</span>
              <div>
                <strong>Esperá el sorteo</strong>
                <small>
                  El día del sorteo se cruza con
                  @if (d.lottery_name) {
                    la lotería oficial <strong>{{ d.lottery_name }}</strong>.
                  } @else {
                    la lotería oficial elegida.
                  }
                </small>
              </div>
            </li>
            <li>
              <span class="steps__num">3</span>
              <div>
                <strong>Reclama tu premio</strong>
                <small>Si alguno de tus números coincide con el ganador, el organizador te contacta para entregarte el premio.</small>
              </div>
            </li>
          </ol>
        </section>

        <!-- VERIFICA TU BOLETA (input manual) -->
        <section class="block">
          <h2 class="block__title">Verifica tu boleta</h2>
          <form class="verify-form" (ngSubmit)="$event.preventDefault(); doVerify(verifyCode)">
            <input
              type="text"
              [(ngModel)]="verifyCode"
              name="code"
              placeholder="Ej: BOL 005 o código corto X7K2"
              autocomplete="off"
              spellcheck="false"
            />
            <button type="submit" [disabled]="verifying()">
              {{ verifying() ? 'Verificando...' : 'Verificar' }}
            </button>
          </form>
          <small class="muted">Escribe el código que aparece en tu boleta física o digital.</small>
        </section>

        <!-- RESPONSABLE -->
        @if (d.responsible_name || d.responsible_phone) {
          <section class="block">
            <h2 class="block__title">Organizador</h2>
            <article class="resp">
              <div>
                @if (d.responsible_name) { <strong>{{ d.responsible_name }}</strong> }
                @if (d.responsible_phone) { <small>{{ d.responsible_phone }}</small> }
              </div>
              @if (d.responsible_phone) {
                <a class="wa" [href]="waUrl(d)" target="_blank" rel="noopener noreferrer">
                  <span class="material-icons">chat</span> Hablar por WhatsApp
                </a>
              }
            </article>
          </section>
        }

        <!-- T&C -->
        @if (d.terms) {
          <section class="block terms">
            <button class="terms__toggle" (click)="showTerms.set(!showTerms())">
              <span class="material-icons">{{ showTerms() ? 'expand_less' : 'expand_more' }}</span>
              Términos y condiciones
            </button>
            @if (showTerms()) {
              <p class="terms__body">{{ d.terms }}</p>
            }
          </section>
        }

        <footer class="foot">
          <small>Plataforma de rifas profesionales <strong>Boletera</strong> · Hecho en Colombia</small>
        </footer>
      }
    </main>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: #0a0e0c;
      color: #e7ecea;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .page {
      position: relative;
      max-width: 720px;
      margin: 0 auto;
      padding: 16px 16px 40px;
      overflow: hidden;
    }
    /* Patrón hexagonal sutil */
    .hex-bg {
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0.06;
      background-image:
        linear-gradient(30deg, transparent 49%, currentColor 49.5%, currentColor 50.5%, transparent 51%),
        linear-gradient(-30deg, transparent 49%, currentColor 49.5%, currentColor 50.5%, transparent 51%),
        linear-gradient(90deg, transparent 49%, currentColor 49.5%, currentColor 50.5%, transparent 51%);
      background-size: 24px 42px;
      color: #1ec77b;
    }

    .topbar {
      position: relative;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 4px 20px;
    }
    .brand { display: flex; align-items: center; gap: 8px; }
    .brand__dot {
      width: 10px; height: 10px;
      background: #1ec77b;
      border-radius: 50%;
      box-shadow: 0 0 0 4px rgba(30, 199, 123, 0.18);
    }
    .brand strong { font-size: 16px; letter-spacing: 0.02em; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      background: linear-gradient(135deg, rgba(212, 168, 87, 0.18), rgba(30, 199, 123, 0.18));
      border: 1px solid rgba(212, 168, 87, 0.4);
      color: #d4a857;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    /* === HERO === */
    .hero {
      position: relative;
      padding: 24px 20px 28px;
      background: linear-gradient(135deg,
        rgba(30, 199, 123, 0.08) 0%,
        rgba(212, 168, 87, 0.06) 100%);
      border: 1px solid rgba(30, 199, 123, 0.18);
      border-radius: 18px;
      overflow: hidden;
    }
    .hero::before {
      /* Línea de cancha sutil */
      content: '';
      position: absolute;
      left: 50%;
      top: 0;
      bottom: 0;
      width: 1px;
      background: linear-gradient(180deg,
        transparent 0,
        rgba(255,255,255,0.05) 30%,
        rgba(255,255,255,0.05) 70%,
        transparent 100%);
    }
    .hero::after {
      content: '';
      position: absolute;
      left: 50%;
      top: 50%;
      width: 60px; height: 60px;
      transform: translate(-50%, -50%);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 50%;
    }
    .hero__inner {
      position: relative;
      display: grid;
      gap: 18px;
    }
    @media (min-width: 640px) {
      .hero__inner {
        grid-template-columns: 1.3fr 1fr;
        align-items: center;
      }
    }
    .kicker {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #d4a857;
    }
    .hero h1 {
      font-size: clamp(24px, 5vw, 34px);
      line-height: 1.1;
      margin: 6px 0 8px;
      font-weight: 900;
      letter-spacing: -0.02em;
      color: #fff;
    }
    .lottery {
      font-size: 13px;
      color: rgba(255,255,255,0.7);
      margin: 0 0 16px;
    }
    .lottery strong { color: #1ec77b; }
    .counters {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .counter {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 14px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      min-width: 88px;
    }
    .counter strong {
      font-size: 22px;
      line-height: 1;
      font-weight: 900;
      color: #fff;
      letter-spacing: -0.02em;
    }
    .counter small {
      font-size: 11px;
      color: rgba(255,255,255,0.6);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .counter.accent strong { color: #d4a857; }
    .counter.accent { border-color: rgba(212, 168, 87, 0.3); }

    .hero__visual {
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .hero__visual img,
    .hero__visual .tv-svg {
      max-width: 100%;
      max-height: 200px;
      width: auto;
      height: auto;
      filter: drop-shadow(0 12px 28px rgba(0,0,0,0.4));
    }

    /* === VERIFICACIÓN === */
    .verify-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px;
      margin-top: 20px;
      background: rgba(30, 199, 123, 0.1);
      border: 1px solid rgba(30, 199, 123, 0.3);
      border-radius: 12px;
    }
    .verify-card.win {
      background: linear-gradient(135deg, rgba(212, 168, 87, 0.16), rgba(30, 199, 123, 0.16));
      border-color: rgba(212, 168, 87, 0.5);
    }
    .verify-card .material-icons { color: #1ec77b; font-size: 28px; }
    .verify-card.win .material-icons { color: #d4a857; }
    .verify-card div { display: flex; flex-direction: column; gap: 2px; }
    .verify-card strong { color: #fff; font-size: 15px; }
    .verify-card small { color: rgba(255,255,255,0.7); font-size: 12px; }
    .verify-card .nums { font-family: 'Courier New', monospace; letter-spacing: 0.04em; }

    /* === BLOQUES GENERALES === */
    .block {
      position: relative;
      margin-top: 28px;
    }
    .block__title {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.02em;
      margin: 0 0 14px;
      padding-left: 12px;
      border-left: 3px solid #1ec77b;
      color: #fff;
    }

    /* Premios */
    .prizes { display: grid; gap: 10px; }
    .prize {
      position: relative;
      display: grid;
      grid-template-columns: auto auto 1fr;
      gap: 12px;
      align-items: center;
      padding: 12px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
    }
    .prize__pos {
      width: 32px; height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(212, 168, 87, 0.18);
      color: #d4a857;
      font-weight: 900;
      font-size: 14px;
      border-radius: 999px;
      border: 1px solid rgba(212, 168, 87, 0.4);
    }
    .prize__img {
      width: 56px; height: 56px;
      object-fit: cover;
      border-radius: 8px;
      background: rgba(255,255,255,0.05);
    }
    .prize__img--placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255,255,255,0.4);
    }
    .prize__img--placeholder .material-icons { font-size: 28px; }
    .prize__body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .prize__body strong { color: #fff; font-size: 14px; }
    .prize__body small { font-size: 12px; color: rgba(255,255,255,0.6); }
    .prize__body .value { color: #d4a857; font-weight: 600; }

    /* Steps */
    .steps {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 14px;
    }
    .steps li {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 14px;
      align-items: flex-start;
      padding: 14px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px;
    }
    .steps__num {
      width: 32px; height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #1ec77b;
      color: #0a0e0c;
      font-weight: 900;
      font-size: 16px;
      border-radius: 999px;
      font-family: 'Inter Tight', 'Inter', sans-serif;
    }
    .steps li div { display: flex; flex-direction: column; gap: 4px; }
    .steps li strong { color: #fff; font-size: 14px; }
    .steps li small { color: rgba(255,255,255,0.65); font-size: 13px; line-height: 1.5; }
    .steps li strong + small strong { color: #1ec77b; }

    /* Verify form */
    .verify-form {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .verify-form input {
      flex: 1;
      min-width: 200px;
      height: 46px;
      padding: 0 16px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      color: #fff;
      font-size: 15px;
      font-family: 'Courier New', monospace;
      letter-spacing: 0.06em;
    }
    .verify-form input:focus {
      outline: 0;
      border-color: #1ec77b;
      background: rgba(255,255,255,0.08);
    }
    .verify-form button {
      height: 46px;
      padding: 0 22px;
      background: #1ec77b;
      color: #0a0e0c;
      border: 0;
      border-radius: 10px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .verify-form button:hover:not(:disabled) { background: #18b06e; }
    .verify-form button:disabled { opacity: 0.5; }

    /* Responsable */
    .resp {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 14px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      flex-wrap: wrap;
    }
    .resp div { display: flex; flex-direction: column; gap: 2px; }
    .resp strong { color: #fff; font-size: 15px; }
    .resp small { color: rgba(255,255,255,0.65); font-size: 13px; }
    .wa {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 16px;
      background: #25d366;
      color: #fff;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 13px;
    }
    .wa:hover { background: #1eb955; }
    .wa .material-icons { font-size: 18px; }

    /* T&C */
    .terms__toggle {
      display: flex;
      align-items: center;
      gap: 4px;
      background: transparent;
      border: 0;
      color: rgba(255,255,255,0.55);
      font-size: 13px;
      cursor: pointer;
    }
    .terms__body {
      margin-top: 8px;
      padding: 12px;
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      color: rgba(255,255,255,0.7);
      font-size: 12.5px;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .foot {
      margin-top: 36px;
      padding-top: 20px;
      border-top: 1px dashed rgba(255,255,255,0.1);
      text-align: center;
      color: rgba(255,255,255,0.4);
      font-size: 11px;
    }

    /* State (loading / error) */
    .state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      padding: 80px 20px;
      text-align: center;
    }
    .state .big { font-size: 56px; color: #ef4444; }
    .state h2 { margin: 0; color: #fff; }
    .muted { color: rgba(255,255,255,0.5); }
    .spinner {
      width: 44px; height: 44px;
      border: 3px solid rgba(255,255,255,0.1);
      border-top-color: #1ec77b;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class RafflePromoComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly data = signal<PromoRaffle | null>(null);
  readonly showTerms = signal(false);
  readonly verifying = signal(false);
  readonly verifyResult = signal<VerifyView | null>(null);

  verifyCode = '';

  readonly totalPrizeValue = computed(() => {
    const d = this.data();
    if (!d) return 0;
    return d.prizes.reduce((sum, p) => sum + (p.estimated_value || 0), 0);
  });

  readonly heroImage = computed(() => {
    const d = this.data();
    if (!d) return null;
    return d.prizes.find((p) => p.image_url)?.image_url || null;
  });

  ngOnInit(): void {
    const raw = this.route.snapshot.paramMap.get('id');
    const id = Number(raw);
    if (!id) {
      this.error.set('URL inválida');
      this.loading.set(false);
      return;
    }

    this.http.get<PromoRaffle>(`${environment.apiUrl}/public/raffles/${id}`).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
        this.applySEO(d);

        // Auto-verifica si vino ?b=<code> en el query
        const b = this.route.snapshot.queryParamMap.get('b');
        if (b) {
          this.verifyCode = b;
          this.doVerify(b);
        }
      },
      error: (e) => {
        const detail = e?.error?.detail;
        this.error.set(typeof detail === 'string' ? detail : 'No se pudo cargar la rifa.');
        this.loading.set(false);
      },
    });
  }

  doVerify(code: string) {
    if (!code || code.trim().length < 3) return;
    this.verifying.set(true);
    this.verifyResult.set(null);
    const cleaned = code.trim().replace(/^BOL\s*/i, '').replace(/\s+/g, '');
    this.http
      .get<VerifyResponse>(`${environment.apiUrl}/verify/${encodeURIComponent(cleaned)}`)
      .subscribe({
        next: (r) => {
          this.verifyResult.set({
            found: r.valid,
            number_label: r.ticket?.label,
            numbers: r.ticket?.numbers,
            is_paid: r.ticket?.is_paid,
            is_winner: r.ticket?.is_winner,
          });
          this.verifying.set(false);
        },
        error: () => {
          this.verifyResult.set({
            found: false,
            message: 'No encontramos esa boleta. Usa el código completo (con guiones) o el QR.',
          });
          this.verifying.set(false);
        },
      });
  }

  waUrl(d: PromoRaffle): string {
    const phone = (d.responsible_phone || '').replace(/\D/g, '');
    const text = encodeURIComponent(
      `Hola ${d.responsible_name || ''}, vi la rifa "${d.name}" y me interesa.`,
    );
    return `https://wa.me/${phone}?text=${text}`;
  }

  fmt(v: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);
  }

  formatDate(iso: string): string {
    const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  private applySEO(d: PromoRaffle) {
    const title = `${d.name} — Boletera`;
    this.title.setTitle(title);
    const desc = d.description ||
      `Participa en "${d.name}". ${d.prizes.length} premio(s). Sorteo: ${this.formatDate(d.final_draw_date)}.`;
    this.meta.updateTag({ name: 'description', content: desc });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: desc });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    const heroImg = this.heroImage();
    if (heroImg) {
      this.meta.updateTag({ property: 'og:image', content: heroImg });
    }
  }
}
