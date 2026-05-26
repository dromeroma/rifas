import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

import { environment } from '@env/environment';

interface PublicRaffleSummary {
  id: number;
  name: string;
  description: string | null;
  primary_color: string | null;
  logo_url: string | null;
  lottery_name: string | null;
  final_draw_date: string;
  days_to_final_draw: number;
  responsible_name: string | null;
  prizes_count: number;
  total_prize_value: number | null;
  main_prize: {
    name: string;
    image_url: string | null;
    estimated_value: number | null;
  } | null;
}

interface ListResponse {
  raffles: PublicRaffleSummary[];
  count: number;
}

/**
 * Índice público de rifas activas. Ruta `/rifas`.
 * Sin auth. Muestra cards de cada rifa con branding mundialista 2026.
 * Cada card linkea a la promo individual en `/r/{id}`.
 */
@Component({
  selector: 'app-raffles-public-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <!-- Gradiente SVG compartido por todas las cards (declarado una sola
           vez para evitar IDs duplicados y para que Angular no falle al
           interpolar IDs dinámicos en atributos SVG). -->
      <svg width="0" height="0" style="position:absolute" aria-hidden="true">
        <defs>
          <linearGradient id="tvCardGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#0d1b2a" />
            <stop offset="60%" stop-color="#070d14" />
            <stop offset="100%" stop-color="#020409" />
          </linearGradient>
        </defs>
      </svg>

      <div class="hex-bg" aria-hidden="true"></div>

      <header class="topbar">
        <a class="brand" href="/">
          <span class="brand__dot"></span>
          <strong>Boletera</strong>
        </a>
        <span class="badge">⚽ Mundial 2026</span>
      </header>

      <section class="hero">
        <small class="kicker">Vibra con la pasión mundialista</small>
        <h1>Rifas en vivo</h1>
        <p class="lead">
          Encuentra todas las rifas activas en Boletera. Toca una para ver premios, fecha del sorteo y cómo participar.
        </p>
      </section>

      @if (loading()) {
        <div class="state">
          <div class="spinner"></div>
          <p>Cargando rifas...</p>
        </div>
      } @else if (error()) {
        <div class="state error">
          <span class="material-icons big">error_outline</span>
          <p>{{ error() }}</p>
        </div>
      } @else if (raffles().length === 0) {
        <div class="state empty">
          <span class="material-icons big">event_busy</span>
          <h2>No hay rifas activas por ahora</h2>
          <p>Vuelve pronto. ¡Las próximas rifas se publicarán aquí!</p>
        </div>
      } @else {
        <section class="grid">
          @for (r of raffles(); track r.id) {
            <a class="card" [routerLink]="['/r', r.id]">
              <div class="card__visual">
                @if (r.main_prize?.image_url) {
                  <img [src]="r.main_prize?.image_url" [alt]="r.main_prize?.name || r.name" />
                } @else {
                  <svg class="tv-svg" viewBox="0 0 320 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <rect x="14" y="12" width="292" height="170" rx="10" ry="10" fill="#0a0e0c" />
                    <rect x="20" y="18" width="280" height="158" rx="6" ry="6"
                          fill="url(#tvCardGrad)" stroke="#1f2937" stroke-width="0.5" />
                    <ellipse cx="120" cy="70" rx="60" ry="30" fill="rgba(255,255,255,0.04)" />
                    <rect x="140" y="182" width="40" height="6" fill="#0a0e0c" />
                    <polygon points="100,196 220,196 200,206 120,206" fill="#0a0e0c" />
                  </svg>
                }
                <div class="card__badge">{{ r.days_to_final_draw }}d</div>
              </div>

              <div class="card__body">
                <h3>{{ r.name }}</h3>
                @if (r.main_prize) {
                  <p class="prize">
                    <span class="material-icons">military_tech</span>
                    <strong>{{ r.main_prize.name }}</strong>
                  </p>
                }
                <div class="meta">
                  <span class="chip">
                    <span class="material-icons">event</span>
                    {{ formatDate(r.final_draw_date) }}
                  </span>
                  @if (r.prizes_count > 1) {
                    <span class="chip">
                      <span class="material-icons">card_giftcard</span>
                      {{ r.prizes_count }} premios
                    </span>
                  }
                  @if (r.total_prize_value) {
                    <span class="chip accent">
                      {{ '$' + fmt(r.total_prize_value) }}
                    </span>
                  }
                </div>
                @if (r.responsible_name) {
                  <small class="muted">Organiza: {{ r.responsible_name }}</small>
                }
                <span class="cta">
                  Ver detalles
                  <span class="material-icons">arrow_forward</span>
                </span>
              </div>
            </a>
          }
        </section>
      }

      <footer class="foot">
        <small>Plataforma de rifas profesionales <strong>Boletera</strong> · Hecho en Colombia</small>
      </footer>
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
      max-width: 1100px;
      margin: 0 auto;
      padding: 16px 16px 40px;
      overflow: hidden;
    }
    .hex-bg {
      position: absolute;
      inset: 0;
      pointer-events: none;
      opacity: 0.05;
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
      padding: 8px 4px 24px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      color: inherit;
    }
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

    .hero {
      position: relative;
      padding: 32px 24px;
      background: linear-gradient(135deg,
        rgba(30, 199, 123, 0.08) 0%,
        rgba(212, 168, 87, 0.05) 100%);
      border: 1px solid rgba(30, 199, 123, 0.18);
      border-radius: 18px;
      margin-bottom: 28px;
      overflow: hidden;
    }
    .hero::after {
      content: '';
      position: absolute;
      right: -40px;
      top: 50%;
      width: 200px; height: 200px;
      transform: translateY(-50%);
      border: 1px solid rgba(255,255,255,0.04);
      border-radius: 50%;
      pointer-events: none;
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
      font-size: clamp(28px, 5vw, 42px);
      line-height: 1.1;
      margin: 6px 0 8px;
      font-weight: 900;
      letter-spacing: -0.02em;
      color: #fff;
    }
    .lead {
      font-size: 14px;
      color: rgba(255,255,255,0.7);
      margin: 0;
      max-width: 560px;
      line-height: 1.5;
    }

    /* Grid de cards */
    .grid {
      position: relative;
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    }
    .card {
      display: flex;
      flex-direction: column;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      overflow: hidden;
      text-decoration: none;
      color: inherit;
      transition: transform 0.15s, border-color 0.15s, background 0.15s;
      cursor: pointer;
    }
    .card:hover {
      transform: translateY(-2px);
      border-color: rgba(30, 199, 123, 0.4);
      background: rgba(255,255,255,0.05);
    }

    .card__visual {
      position: relative;
      aspect-ratio: 16 / 10;
      background: #0a0e0c;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .card__visual img,
    .card__visual .tv-svg {
      max-width: 80%;
      max-height: 80%;
      object-fit: contain;
    }
    .card__visual img {
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      object-fit: cover;
    }
    .card__badge {
      position: absolute;
      top: 12px;
      right: 12px;
      padding: 4px 10px;
      background: rgba(212, 168, 87, 0.9);
      color: #0a0e0c;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.04em;
    }

    .card__body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px;
      flex: 1;
    }
    .card__body h3 {
      font-size: 16px;
      font-weight: 800;
      margin: 0;
      color: #fff;
      line-height: 1.3;
    }
    .prize {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      font-size: 13px;
      color: rgba(255,255,255,0.85);
    }
    .prize .material-icons {
      font-size: 18px;
      color: #d4a857;
    }
    .prize strong { color: #fff; font-weight: 600; }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      color: rgba(255,255,255,0.85);
    }
    .chip .material-icons { font-size: 14px; }
    .chip.accent {
      background: rgba(212, 168, 87, 0.16);
      border-color: rgba(212, 168, 87, 0.35);
      color: #d4a857;
    }
    .muted { color: rgba(255,255,255,0.55); font-size: 12px; }

    .cta {
      margin-top: auto;
      padding-top: 8px;
      display: flex;
      align-items: center;
      gap: 4px;
      color: #1ec77b;
      font-size: 13px;
      font-weight: 700;
    }
    .cta .material-icons { font-size: 18px; }

    /* States */
    .state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 80px 20px;
      text-align: center;
      color: rgba(255,255,255,0.7);
    }
    .state h2 { color: #fff; margin: 0; }
    .state p { margin: 0; max-width: 400px; }
    .state .big { font-size: 56px; color: rgba(255,255,255,0.4); }
    .state.error .big { color: #ef4444; }
    .spinner {
      width: 44px; height: 44px;
      border: 3px solid rgba(255,255,255,0.1);
      border-top-color: #1ec77b;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .foot {
      margin-top: 48px;
      padding-top: 20px;
      border-top: 1px dashed rgba(255,255,255,0.1);
      text-align: center;
      color: rgba(255,255,255,0.4);
      font-size: 11px;
    }
  `],
})
export class RafflesPublicListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly raffles = signal<PublicRaffleSummary[]>([]);

  ngOnInit(): void {
    this.title.setTitle('Rifas en vivo — Boletera');
    this.meta.updateTag({
      name: 'description',
      content: 'Encuentra todas las rifas activas en Boletera. Premios, fechas y cómo participar.',
    });
    this.meta.updateTag({ property: 'og:title', content: 'Rifas en vivo — Boletera' });

    this.http.get<ListResponse>(`${environment.apiUrl}/public/raffles`).subscribe({
      next: (r) => {
        this.raffles.set(r.raffles);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('No se pudieron cargar las rifas. Intenta nuevamente.');
        this.loading.set(false);
      },
    });
  }

  fmt(v: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);
  }

  formatDate(iso: string): string {
    const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
