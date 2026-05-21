import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { environment } from '@env/environment';
import {
  CardComponent, ChipComponent, ProgressRingComponent, ThemeToggleComponent,
} from '@shared/ui';

interface PublicRafflePrize {
  position: number;
  name: string;
  description: string | null;
  estimated_value: number | null;
  draw_date: string;
  image_url: string | null;
  winning_number: string | null;
}

interface PublicNextDraw {
  name: string;
  draw_date: string;
  days_remaining: number;
}

interface PublicRaffleData {
  id: number;
  name: string;
  description: string | null;
  lottery_name: string | null;
  primary_color: string | null;
  logo_url: string | null;
  final_draw_date: string;
  days_to_final_draw: number;
  total_tickets: number;
  sold_pct: number;
  threshold_pct_of_total: number;
  progress_to_threshold_pct: number;
  can_run_draw: boolean;
  prizes: PublicRafflePrize[];
  next_draw: PublicNextDraw | null;
  responsible_name: string | null;
  responsible_phone: string | null;
  responsible_email: string | null;
  terms: string | null;
}

@Component({
  selector: 'app-public-raffle',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    CardComponent, ChipComponent, ProgressRingComponent, ThemeToggleComponent,
  ],
  template: `
    <main class="page">
      <header class="page__top">
        <a routerLink="/" class="brand" aria-label="Inicio">🎟️ <strong>Boletera</strong></a>
        <app-theme-toggle />
      </header>

      <div class="container">
        @if (loading()) {
          <div class="state">
            <div class="spinner"></div>
            <p class="muted">Cargando rifa...</p>
          </div>
        }

        @if (!loading() && error()) {
          <app-card>
            <div class="state state--err">
              <span class="material-icons big">error</span>
              <h2>Rifa no encontrada</h2>
              <p class="muted">{{ error() }}</p>
            </div>
          </app-card>
        }

        @if (!loading() && !error() && data(); as d) {
          <!-- Hero -->
          <section class="hero" [style.--accent]="d.primary_color || ''">
            <small class="hero__label">RIFA EN VENTA</small>
            <h1 class="hero__name">{{ d.name }}</h1>
            @if (d.lottery_name) {
              <p class="hero__lottery">
                <span class="material-icons">casino</span>
                Juega con: <strong>{{ d.lottery_name }}</strong>
              </p>
            }
            @if (d.description) {
              <p class="hero__desc">{{ d.description }}</p>
            }
          </section>

          <!-- Premio mayor -->
          @if (majorPrize(); as mp) {
            <app-card>
              <div class="major">
                <span class="material-icons major__icon">military_tech</span>
                <div class="major__body">
                  <small class="label">PREMIO MAYOR</small>
                  <h2>{{ mp.name }}</h2>
                  @if (mp.estimated_value) {
                    <small class="muted">Valor estimado: <strong>{{ '$' + fmt(mp.estimated_value) }}</strong></small>
                  }
                  <small class="muted">Sorteo: <strong>{{ mp.draw_date }}</strong></small>
                </div>
              </div>
            </app-card>
          }

          <!-- Progreso de venta -->
          <app-card title="Avance de venta" subtitle="¿Cuánto falta para sortear?">
            <div class="progress-row">
              <app-progress-ring
                [value]="d.sold_pct"
                [size]="128"
                label="vendido"
              />
              <div class="progress-info">
                <div class="kpi">
                  <small class="label">Boletas vendidas</small>
                  <strong>{{ pct(d.sold_pct) }}%</strong>
                </div>
                <div class="kpi">
                  <small class="label">Umbral para sortear</small>
                  <strong>{{ pct(d.threshold_pct_of_total) }}%</strong>
                </div>
                @if (d.can_run_draw) {
                  <app-chip tone="paid">✓ Ya se puede sortear</app-chip>
                } @else {
                  <small class="muted">
                    El sorteo se lanza cuando se alcance el
                    <strong>{{ pct(d.threshold_pct_of_total) }}%</strong> de las boletas vendidas.
                  </small>
                }
              </div>
            </div>
          </app-card>

          <!-- Próximo sorteo / cuenta regresiva -->
          @if (d.next_draw; as nd) {
            <app-card>
              <div class="next-draw">
                <span class="material-icons next-draw__icon">event</span>
                <div>
                  <small class="label">PRÓXIMO SORTEO</small>
                  <strong>{{ nd.name }}</strong>
                  <small class="muted">
                    {{ nd.draw_date }} ·
                    @if (nd.days_remaining > 0) {
                      faltan <strong>{{ nd.days_remaining }}</strong> día(s)
                    } @else {
                      <strong>hoy</strong>
                    }
                  </small>
                </div>
              </div>
            </app-card>
          }

          <!-- Lista de premios -->
          <app-card title="Premios" [subtitle]="d.prizes.length + ' en total'">
            <ul class="prizes">
              @for (p of d.prizes; track p.position) {
                <li class="prize" [class.prize--won]="p.winning_number">
                  <div class="prize__pos">{{ p.position }}</div>
                  <div class="prize__body">
                    <strong>{{ p.name }}</strong>
                    <small class="muted">
                      Sorteo: {{ p.draw_date }}
                      @if (p.estimated_value) { · {{ '$' + fmt(p.estimated_value) }} }
                    </small>
                    @if (p.description) {
                      <small class="muted prize__desc">{{ p.description }}</small>
                    }
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

          <!-- Sorteo final -->
          <app-card>
            <div class="final-draw">
              <span class="material-icons">flag</span>
              <div>
                <small class="label">SORTEO FINAL</small>
                <strong>{{ d.final_draw_date }}</strong>
                @if (d.days_to_final_draw > 0) {
                  <small class="muted">faltan {{ d.days_to_final_draw }} día(s)</small>
                }
              </div>
            </div>
          </app-card>

          <!-- Responsable -->
          @if (d.responsible_name || d.responsible_phone) {
            <app-card title="Responsable de la rifa">
              <div class="responsible">
                @if (d.responsible_name) {
                  <div class="resp__row">
                    <span class="material-icons">person</span>
                    <span>{{ d.responsible_name }}</span>
                  </div>
                }
                @if (d.responsible_phone) {
                  <a class="resp__row resp__row--link"
                     [href]="'tel:' + d.responsible_phone">
                    <span class="material-icons">phone</span>
                    <span>{{ d.responsible_phone }}</span>
                  </a>
                }
                @if (d.responsible_email) {
                  <a class="resp__row resp__row--link"
                     [href]="'mailto:' + d.responsible_email">
                    <span class="material-icons">mail</span>
                    <span>{{ d.responsible_email }}</span>
                  </a>
                }
              </div>
            </app-card>
          }

          @if (d.terms) {
            <app-card>
              <small class="label">Términos</small>
              <p class="terms">{{ d.terms }}</p>
            </app-card>
          }

          <small class="footer-note muted">
            Para verificar una boleta específica, ingresa su código en
            <a href="/verify">/verify</a> o escanea el QR de tu boleta.
          </small>
        }
      </div>
    </main>
  `,
  styles: [`
    .page { min-height: 100dvh; background: var(--bg-base); }
    .page__top {
      display: flex; justify-content: space-between; align-items: center;
      padding: var(--s-4);
      max-width: 540px;
      margin: 0 auto;
    }
    .brand {
      font-weight: 500; font-size: 15px; color: var(--text);
      text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
    }
    .brand strong { font-weight: 700; }
    .brand:hover { color: var(--accent); }

    .container {
      max-width: 540px;
      margin: 0 auto;
      padding: 0 var(--s-4) var(--s-7);
      display: grid;
      gap: var(--s-3);
    }

    .state { display: grid; place-items: center; gap: var(--s-3); padding: var(--s-7) var(--s-4); text-align: center; color: var(--text-muted); }
    .state.state--err { color: var(--danger); padding: var(--s-5) 0; }
    .state .big { font-size: 56px; }
    .state h2 { color: var(--text); margin: 0; }
    .spinner {
      width: 36px; height: 36px;
      border: 3px solid var(--bg-hover);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .hero {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-left: 4px solid var(--accent);
      border-radius: var(--r-lg);
      padding: var(--s-5);
      display: grid; gap: 6px;
    }
    .hero__label { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; color: var(--accent); }
    .hero__name { margin: 0; font-size: 26px; color: var(--text); line-height: 1.2; }
    .hero__lottery {
      display: flex; align-items: center; gap: 6px;
      margin: 8px 0 0;
      color: var(--text); font-size: 14px;
    }
    .hero__lottery .material-icons { color: var(--accent); font-size: 18px; }
    .hero__desc { color: var(--text-muted); font-size: 14px; margin: 6px 0 0; line-height: 1.5; }

    .label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; color: var(--text-muted); display: block; }
    .muted { color: var(--text-muted); font-size: 13px; }

    /* Premio mayor */
    .major { display: flex; gap: var(--s-3); align-items: center; }
    .major__icon {
      width: 56px; height: 56px;
      background: var(--accent-soft); color: var(--accent);
      border-radius: 50%;
      display: grid; place-items: center;
      font-size: 30px !important;
      flex-shrink: 0;
    }
    .major__body { display: grid; gap: 2px; }
    .major__body h2 { font-size: 18px; margin: 2px 0; color: var(--text); }

    /* Progreso */
    .progress-row {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--s-4);
      align-items: center;
    }
    @media (max-width: 480px) {
      .progress-row { grid-template-columns: 1fr; justify-items: center; text-align: center; }
    }
    .progress-info { display: grid; gap: var(--s-2); }
    .kpi { display: grid; gap: 2px; }
    .kpi strong { font-size: 18px; color: var(--text); font-variant-numeric: tabular-nums; }

    /* Próximo sorteo */
    .next-draw { display: flex; gap: var(--s-3); align-items: center; }
    .next-draw__icon { color: var(--accent); font-size: 32px !important; }
    .next-draw div { display: grid; gap: 2px; }
    .next-draw strong { color: var(--text); font-size: 16px; }

    /* Lista de premios */
    .prizes { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s-2); }
    .prize {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: var(--s-3);
      align-items: center;
      padding: var(--s-3);
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
    }
    .prize__pos {
      width: 32px; height: 32px;
      background: var(--accent-soft); color: var(--accent);
      border-radius: 50%;
      display: grid; place-items: center;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .prize__body { display: grid; gap: 2px; min-width: 0; }
    .prize__body strong { font-size: 14px; color: var(--text); }
    .prize__body small { font-size: 12px; line-height: 1.4; }
    .prize__desc { font-style: italic; }
    .prize--won { background: rgba(245, 180, 0, 0.08); border-color: #f5b400; }
    .prize--won .prize__pos { background: rgba(245, 180, 0, 0.18); color: #b8860b; }

    /* Final draw */
    .final-draw { display: flex; gap: var(--s-3); align-items: center; }
    .final-draw .material-icons { color: var(--warning); font-size: 28px !important; }
    .final-draw div { display: grid; gap: 2px; }
    .final-draw strong { color: var(--text); font-size: 15px; }

    /* Responsable */
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

    .terms { font-size: 13px; color: var(--text); line-height: 1.55; margin: 6px 0 0; white-space: pre-line; }

    .footer-note {
      display: block; text-align: center; font-size: 12px;
      padding: var(--s-4) 0;
    }
    .footer-note a { color: var(--accent); }
  `],
})
export class PublicRaffleComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);

  loading = signal(true);
  error = signal<string | null>(null);
  data = signal<PublicRaffleData | null>(null);

  readonly majorPrize = computed<PublicRafflePrize | null>(() => {
    const d = this.data();
    return d?.prizes.find((p) => p.position === 1) ?? null;
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id || Number.isNaN(id)) {
      this.error.set('Identificador de rifa inválido.');
      this.loading.set(false);
      return;
    }

    this.http.get<PublicRaffleData>(`${environment.apiUrl}/public/raffles/${id}`).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: (e) => {
        const detail =
          e?.error?.detail ??
          (e?.status === 0
            ? 'No se pudo contactar al servidor. Verifica tu conexión.'
            : `Error ${e?.status ?? '?'} al consultar la rifa.`);
        this.error.set(detail);
        this.loading.set(false);
      },
    });
  }

  fmt(v: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);
  }

  pct(v: number | null | undefined): string {
    if (v == null) return '0';
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number(v));
  }
}
