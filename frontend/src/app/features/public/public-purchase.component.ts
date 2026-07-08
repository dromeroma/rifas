import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, OnDestroy, OnInit,
  computed, inject, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  AvailableTicket,
  PublicRaffleOverview,
  PublicSalesService,
  PublicTicketDetail,
  TicketLookup,
} from '@core/services/public-sales.service';
import { TicketDesignComponent } from '@shared/components/ticket-design/ticket-design.component';

/**
 * Portal PÚBLICO de compra online — v4 SaaS premium.
 *
 * Estilo: dark theme fijo (#0B0B0D), inspirado en Linear / Stripe / Vercel.
 * Tipografía Inter, acento dorado #D4AF37 solo en CTA y estados activos.
 * Selector de boletas como componente protagonista.
 *
 * Estructura:
 *   Topbar (brand + estado rifa)
 *   Hero balanceado (contenido + product card compact)
 *   Countdown timer
 *   Selector protagonista con 4 estados (available/selected/reserved/sold)
 *   Grid de premios (cards uniformes)
 *   Pasos (3 cards simples con iconos)
 *   FAQ (acordeón nativo)
 *   Footer minimal
 */
@Component({
  selector: 'app-public-purchase',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TicketDesignComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app">
      @if (loading()) {
        <div class="page-loader">
          <div class="page-loader__spinner"></div>
        </div>
      } @else if (error()) {
        <div class="page-loader">
          <p class="muted">{{ error() }}</p>
          <a routerLink="/" class="btn btn--ghost">Volver al inicio</a>
        </div>
      } @else if (overview(); as r) {

        <!-- ============ TOPBAR ============ -->
        <header class="topbar">
          <div class="topbar__inner">
            <a routerLink="/" class="brand">
              <span class="brand__dot"></span>
              <span class="brand__name">Boletera</span>
            </a>
            <div class="topbar__actions">
              <span class="badge badge--live">
                <span class="badge__pulse"></span>
                Rifa activa
              </span>
            </div>
          </div>
        </header>

        <!-- ============ HERO ============ -->
        <section class="hero">
          <div class="container hero__grid">
            <div class="hero__content">
              <div class="hero__meta">
                <span class="pill">
                  {{ r.prizes.length }} premios
                </span>
                @if (r.show_draw_date && r.final_draw_date) {
                  <span class="pill pill--muted">
                    <span class="material-icons-outlined">event</span>
                    Sorteo {{ formatDate(r.final_draw_date) }}
                  </span>
                }
              </div>

              <h1 class="h-display">{{ r.name }}</h1>

              @if (r.description) {
                <p class="h-lead">{{ r.description }}</p>
              } @else {
                <p class="h-lead">
                  Compra tu boleta digital. Transparencia total, verificación pública
                  y notificación instantánea.
                </p>
              }

              <div class="stats">
                <div class="stat">
                  <div class="stat__value">\${{ formatNumber(r.ticket_price) }}</div>
                  <div class="stat__label">Precio por boleta</div>
                </div>
                <div class="stat__sep"></div>
                <div class="stat">
                  <div class="stat__value">{{ r.total_tickets }}</div>
                  <div class="stat__label">Boletas totales</div>
                </div>
                <div class="stat__sep"></div>
                <div class="stat">
                  <div class="stat__value">{{ availableCount() }}</div>
                  <div class="stat__label">Disponibles</div>
                </div>
              </div>

              <div class="progress">
                <div class="progress__track">
                  <div class="progress__bar" [style.width.%]="r.sold_pct"></div>
                </div>
                <div class="progress__meta">
                  <span>{{ r.sold_pct }}% vendido</span>
                  <span class="muted">{{ availableCount() }} boletas disponibles</span>
                </div>
              </div>

              <div class="cta-row">
                <button class="btn btn--gold btn--lg" (click)="scrollToGrid()">
                  Elegir boleta
                  <span class="material-icons-outlined">arrow_forward</span>
                </button>
                <button class="btn btn--ghost btn--lg" (click)="scrollToPrizes()">
                  Ver premios
                </button>
              </div>
            </div>

            <aside class="hero__product">
              @if (r.logo_url) {
                <div class="product-card">
                  <div class="product-card__label">Premio mayor</div>
                  <div class="product-card__media">
                    <img [src]="r.logo_url" [alt]="topPrizeName()" />
                  </div>
                  <div class="product-card__body">
                    <h3>{{ topPrizeName() }}</h3>
                    @if (r.prizes[0]?.draw_date) {
                      <p class="muted">
                        <span class="material-icons-outlined">event</span>
                        {{ formatDate(r.prizes[0].draw_date!) }}
                      </p>
                    }
                  </div>
                </div>
              } @else {
                <div class="product-card product-card--empty">
                  <div class="product-card__label">Premio mayor</div>
                  <div class="product-card__body">
                    <h3>{{ topPrizeName() }}</h3>
                  </div>
                </div>
              }
            </aside>
          </div>
        </section>

        <!-- ============ COUNTDOWN ============ -->
        @if (countdown(); as c) {
          <section class="countdown-wrap">
            <div class="container countdown">
              <div class="countdown__title">
                <span class="material-icons-outlined">schedule</span>
                Sorteo en
              </div>
              <div class="countdown__values">
                <div class="cd-unit">
                  <span class="cd-unit__value">{{ c.days }}</span>
                  <span class="cd-unit__label">Días</span>
                </div>
                <div class="cd-unit">
                  <span class="cd-unit__value">{{ c.hours }}</span>
                  <span class="cd-unit__label">Horas</span>
                </div>
                <div class="cd-unit">
                  <span class="cd-unit__value">{{ c.minutes }}</span>
                  <span class="cd-unit__label">Minutos</span>
                </div>
                <div class="cd-unit">
                  <span class="cd-unit__value">{{ c.seconds }}</span>
                  <span class="cd-unit__label">Segundos</span>
                </div>
              </div>
            </div>
          </section>
        }

        <!-- ============ SELECTOR DE BOLETAS (protagonista) ============ -->
        <section class="picker" id="grid-section">
          <div class="container">
            <div class="picker__head">
              <div>
                <span class="pill pill--muted">Selector</span>
                <h2 class="h-section">Elige tu boleta</h2>
                <p class="muted">
                  Toca una boleta para ver su diseño. Puedes seleccionar hasta 10.
                </p>
              </div>
              <div class="legend">
                <span class="legend__item">
                  <span class="legend__dot legend__dot--available"></span>
                  Disponible
                </span>
                <span class="legend__item">
                  <span class="legend__dot legend__dot--selected"></span>
                  Seleccionada
                </span>
                <span class="legend__item">
                  <span class="legend__dot legend__dot--reserved"></span>
                  Reservada
                </span>
                <span class="legend__item">
                  <span class="legend__dot legend__dot--sold"></span>
                  Vendida
                </span>
              </div>
            </div>

            <!-- Buscador inline -->
            <form class="search" (ngSubmit)="doSearch()">
              <span class="search__icon material-icons-outlined">search</span>
              <input type="number" class="search__input"
                     [(ngModel)]="searchInput" name="searchInput"
                     [placeholder]="'Buscar número (ej ' + searchPlaceholder() + ')'"
                     inputmode="numeric" />
              <button type="submit" class="btn btn--gold" [disabled]="searching()">
                @if (searching()) {
                  <span class="btn__spin"></span>
                } @else {
                  Buscar
                }
              </button>
            </form>

            @if (searchResult(); as sr) {
              <div class="search-result" [attr.data-status]="sr.status">
                <span class="search-result__icon material-icons-outlined">
                  {{ sr.status === 'available' ? 'check_circle'
                   : sr.status === 'sold' ? 'block'
                   : sr.status === 'reserved' ? 'schedule'
                   : sr.status === 'assigned' ? 'person'
                   : 'help_outline' }}
                </span>
                <div class="search-result__body">
                  <strong>Boleta {{ sr.number_label }}</strong>
                  <p>{{ sr.message }}</p>
                </div>
                @if (sr.status === 'available' && sr.ticket_id) {
                  <div class="search-result__actions">
                    <button class="btn btn--ghost btn--sm"
                            (click)="openTicketPreviewById(sr.ticket_id!)">
                      Ver diseño
                    </button>
                    <button class="btn btn--gold btn--sm"
                            (click)="selectFromSearch(sr.ticket_id!)">
                      Reservar
                    </button>
                  </div>
                }
                <button class="search-result__close" (click)="clearSearch()"
                        aria-label="Cerrar">
                  <span class="material-icons-outlined">close</span>
                </button>
              </div>
            }

            @if (loadingTickets()) {
              <div class="grid grid--skeleton">
                @for (i of skeletonRange; track i) {
                  <div class="ticket ticket--skeleton"></div>
                }
              </div>
            } @else if (!available().length) {
              <div class="empty">
                <span class="empty__icon material-icons-outlined">inbox</span>
                <h3>No hay boletas disponibles</h3>
                <p class="muted">Todas están asignadas o vendidas.</p>
              </div>
            } @else {
              <div class="grid">
                @for (t of available(); track t.id) {
                  <button type="button"
                          [id]="'ticket-' + t.id"
                          class="ticket ticket--available"
                          [class.ticket--selected]="isSelected(t.id)"
                          [class.ticket--pulse]="pulseTicketId() === t.id"
                          (click)="openTicketPreview(t)">
                    <span class="ticket__number">{{ t.number_label }}</span>
                    @if (isSelected(t.id)) {
                      <span class="ticket__check material-icons-outlined">check</span>
                    }
                  </button>
                }
              </div>
            }
          </div>

          <!-- Footer sticky con selección -->
          @if (selected().size > 0) {
            <div class="picker__bar">
              <div class="container picker__bar-inner">
                <div class="picker__bar-info">
                  <div class="picker__bar-count">
                    {{ selected().size }} {{ selected().size === 1 ? 'boleta' : 'boletas' }}
                  </div>
                  <div class="picker__bar-total">
                    Total <strong>\${{ formatNumber(totalPrice()) }}</strong>
                  </div>
                </div>
                <button class="btn btn--gold btn--lg" (click)="openCheckout()">
                  Continuar al pago
                  <span class="material-icons-outlined">arrow_forward</span>
                </button>
              </div>
            </div>
          }
        </section>

        <!-- ============ PREMIOS ============ -->
        @if (r.prizes.length) {
          <section class="section" id="prizes-section">
            <div class="container">
              <div class="section__head">
                <span class="pill pill--muted">Premios</span>
                <h2 class="h-section">{{ r.prizes.length }} oportunidades de ganar</h2>
                <p class="h-lead-sm">
                  Cada boleta juega por todos los premios en fechas distintas.
                </p>
              </div>
              <div class="prizes-grid">
                @for (p of r.prizes; track p.position; let idx = $index) {
                  <article class="prize-card" [class.prize-card--top]="idx === 0">
                    <div class="prize-card__head">
                      <div class="prize-card__num">
                        {{ (idx + 1) < 10 ? '0' : '' }}{{ idx + 1 }}
                      </div>
                      @if (idx === 0) {
                        <span class="prize-card__tag">Premio mayor</span>
                      }
                    </div>
                    <h3 class="prize-card__title">{{ p.name }}</h3>
                    @if (p.draw_date) {
                      <div class="prize-card__meta">
                        <span class="material-icons-outlined">event</span>
                        {{ formatDate(p.draw_date) }}
                      </div>
                    }
                  </article>
                }
              </div>
            </div>
          </section>
        }

        <!-- ============ CÓMO FUNCIONA ============ -->
        <section class="section">
          <div class="container">
            <div class="section__head">
              <span class="pill pill--muted">Proceso</span>
              <h2 class="h-section">Comprar en 3 pasos</h2>
            </div>
            <div class="steps">
              <article class="step">
                <div class="step__icon">
                  <span class="material-icons-outlined">grid_view</span>
                </div>
                <div class="step__num">01</div>
                <h3>Elige tu boleta</h3>
                <p class="muted">
                  Explora las disponibles y ve el diseño real antes de reservar.
                </p>
              </article>
              <article class="step">
                <div class="step__icon">
                  <span class="material-icons-outlined">credit_card</span>
                </div>
                <div class="step__num">02</div>
                <h3>Paga en línea</h3>
                <p class="muted">
                  Nequi, PSE, tarjeta o transferencia con comprobante. Reserva 24h.
                </p>
              </article>
              <article class="step">
                <div class="step__icon">
                  <span class="material-icons-outlined">verified</span>
                </div>
                <div class="step__num">03</div>
                <h3>Verificación pública</h3>
                <p class="muted">
                  Te notificamos por correo y WhatsApp. Verifica tu boleta con un QR.
                </p>
              </article>
            </div>
          </div>
        </section>

        <!-- ============ FAQ ============ -->
        <section class="section">
          <div class="container container--narrow">
            <div class="section__head">
              <span class="pill pill--muted">Preguntas frecuentes</span>
              <h2 class="h-section">Todo lo que necesitas saber</h2>
            </div>
            <div class="faq">
              @for (q of faq; track q.q) {
                <details class="faq__item">
                  <summary class="faq__q">
                    <span>{{ q.q }}</span>
                    <span class="faq__chev material-icons-outlined">expand_more</span>
                  </summary>
                  <div class="faq__a">
                    <p>{{ q.a }}</p>
                  </div>
                </details>
              }
            </div>
          </div>
        </section>

        <!-- ============ FOOTER ============ -->
        <footer class="foot">
          <div class="container foot__inner">
            <div class="foot__brand">
              <span class="brand__dot"></span>
              <span>Boletera</span>
            </div>
            <div class="foot__meta">
              @if (r.lottery_name) {
                <span>Juega con {{ r.lottery_name }}</span>
                <span class="foot__sep">·</span>
              }
              <span>Compra segura</span>
              <span class="foot__sep">·</span>
              <span>Verificación pública</span>
            </div>
          </div>
        </footer>

      }

      <!-- ============ MODAL PREVIEW DE BOLETA ============ -->
      @if (previewOpen() && previewData(); as pd) {
        <div class="modal" (click)="closePreview()">
          <div class="modal__card modal__card--wide" (click)="$event.stopPropagation()">
            <div class="modal__head">
              <div>
                <div class="pill pill--muted">Boleta {{ pd.ticket.label }}</div>
                <h2>Diseño de tu boleta</h2>
              </div>
              <button class="icon-btn" (click)="closePreview()" aria-label="Cerrar">
                <span class="material-icons-outlined">close</span>
              </button>
            </div>

            <div class="preview-ticket">
              <app-ticket-design
                [ticket]="previewTicket()!"
                [raffleName]="pd.raffle.name"
                [prizes]="previewPrizes()"
                [primaryColor]="pd.raffle.primary_color || '#1b8b3b'"
                [ticketPrice]="overview()?.ticket_price ?? null"
                [responsibleName]="pd.raffle.responsible_name"
                [responsiblePhone]="pd.raffle.responsible_phone" />
            </div>

            <div class="modal__actions">
              @if (isSelected(previewTicketId()!)) {
                <button class="btn btn--ghost btn--lg"
                        (click)="removeFromSelection(previewTicketId()!)">
                  Quitar de la selección
                </button>
              } @else {
                <button class="btn btn--ghost btn--lg" (click)="selectAndClosePreview()">
                  Agregar a mi selección
                </button>
              }
              <button class="btn btn--gold btn--lg" (click)="reserveAndCheckoutNow()">
                Reservar y pagar
                <span class="material-icons-outlined">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      }

      <!-- ============ MODAL CHECKOUT ============ -->
      @if (checkoutOpen()) {
        <div class="modal" (click)="closeCheckout()">
          <div class="modal__card" (click)="$event.stopPropagation()">
            <div class="modal__head">
              <div>
                <div class="pill pill--muted">Checkout</div>
                <h2>Completar compra</h2>
                <p class="muted">
                  <strong>{{ selected().size }}</strong>
                  {{ selected().size === 1 ? 'boleta' : 'boletas' }}
                  · Total <strong>\${{ formatNumber(totalPrice()) }}</strong>
                </p>
              </div>
              <button class="icon-btn" (click)="closeCheckout()" aria-label="Cerrar">
                <span class="material-icons-outlined">close</span>
              </button>
            </div>

            <form class="form" (ngSubmit)="submit()" autocomplete="on">
              <label class="field">
                <span class="field__label">Cédula</span>
                <input class="input" type="text" [(ngModel)]="form.customer_document"
                       name="doc" required minlength="4" maxlength="30"
                       inputmode="numeric" placeholder="Número de cédula" />
              </label>
              <label class="field">
                <span class="field__label">Nombre completo</span>
                <input class="input" type="text" [(ngModel)]="form.customer_name"
                       name="name" required minlength="2" maxlength="150"
                       autocomplete="name" placeholder="Nombre y apellidos" />
              </label>
              <label class="field">
                <span class="field__label">Email</span>
                <input class="input" type="email" [(ngModel)]="form.customer_email"
                       name="email" required autocomplete="email"
                       placeholder="tu@ejemplo.com" />
              </label>
              <label class="field">
                <span class="field__label">Celular (WhatsApp)</span>
                <input class="input" type="tel" [(ngModel)]="form.customer_phone"
                       name="phone" required minlength="7" autocomplete="tel"
                       placeholder="3001234567" />
              </label>
              <label class="field">
                <span class="field__label">Ciudad <small>opcional</small></span>
                <input class="input" type="text" [(ngModel)]="form.customer_city"
                       name="city" maxlength="80" autocomplete="address-level2"
                       placeholder="Ej. Valledupar" />
              </label>

              @if (overview()?.enable_online_purchase) {
                <button type="submit" class="btn btn--gold btn--lg btn--block"
                        [disabled]="submitting()">
                  @if (submitting()) {
                    <span class="btn__spin"></span> Redirigiendo…
                  } @else {
                    Pagar con Wompi
                    <span class="material-icons-outlined">arrow_forward</span>
                  }
                </button>
                <small class="muted center">
                  Nequi · PSE · Bancolombia · Tarjeta
                </small>
              }

              @if (overview()?.enable_manual_transfer) {
                <div class="or"><span>o</span></div>
                <button type="button" class="btn btn--ghost btn--lg btn--block"
                        (click)="switchManual()">
                  <span class="material-icons-outlined">receipt_long</span>
                  Subir comprobante de transferencia
                </button>
              }
            </form>

            @if (submitError()) {
              <div class="alert">
                <span class="material-icons-outlined">error_outline</span>
                {{ submitError() }}
              </div>
            }
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    /* ============================================================
       SISTEMA DE DISEÑO — SaaS premium dark
       ============================================================ */
    :host {
      --bg:            #0B0B0D;
      --surface:       #111214;
      --surface-2:     #1B1C20;
      --card:          #1B1C20;
      --card-hover:    #22232A;
      --border:        rgba(255, 255, 255, 0.08);
      --border-strong: rgba(255, 255, 255, 0.14);
      --text:          #FFFFFF;
      --text-muted:    #B5B7BE;
      --text-dim:      #6E7079;

      --gold:          #D4AF37;
      --gold-hover:    #E4C15A;
      --gold-soft:     rgba(212, 175, 55, 0.12);

      --green:         #16a34a;
      --red:           #ef4444;
      --amber:         #f59e0b;
      --blue:          #3b82f6;

      --shadow-sm:     0 1px 2px rgba(0,0,0,0.4);
      --shadow-md:     0 8px 24px rgba(0,0,0,0.35);
      --shadow-lg:     0 20px 60px rgba(0,0,0,0.5);

      --r-sm:  10px;
      --r-md:  14px;
      --r-lg:  20px;
      --r-xl:  24px;

      --t-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
      --t-med:  240ms cubic-bezier(0.4, 0, 0.2, 1);

      display: block;
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      min-height: 100vh;
      font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
    }

    * { box-sizing: border-box; }

    .app {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .container {
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 24px;
    }
    .container--narrow { max-width: 760px; }
    @media (max-width: 720px) { .container { padding: 0 20px; } }

    .muted { color: var(--text-muted); }
    .center { text-align: center; display: block; }

    /* ============ Loader ============ */
    .page-loader {
      display: grid; place-items: center;
      min-height: 100vh;
      gap: 20px;
    }
    .page-loader__spinner {
      width: 32px; height: 32px;
      border: 2px solid var(--border);
      border-top-color: var(--gold);
      border-radius: 50%;
      animation: spin 700ms linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ============================================================
       TOPBAR
       ============================================================ */
    .topbar {
      position: sticky;
      top: 0;
      z-index: 40;
      background: rgba(11, 11, 13, 0.72);
      backdrop-filter: saturate(180%) blur(20px);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      border-bottom: 1px solid var(--border);
    }
    .topbar__inner {
      max-width: 1200px;
      margin: 0 auto;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: var(--text);
      text-decoration: none;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.01em;
    }
    .brand__dot {
      width: 8px; height: 8px;
      background: var(--gold);
      border-radius: 50%;
      box-shadow: 0 0 12px var(--gold);
    }
    .brand__name { color: var(--text); }

    /* ============================================================
       BADGES / PILLS
       ============================================================ */
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      background: var(--gold-soft);
      color: var(--gold);
      border: 1px solid rgba(212, 175, 55, 0.25);
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
      line-height: 1.2;
    }
    .pill--muted {
      background: rgba(255, 255, 255, 0.04);
      color: var(--text-muted);
      border-color: var(--border);
    }
    .pill .material-icons-outlined { font-size: 14px; }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      line-height: 1.2;
    }
    .badge--live { color: var(--text); }
    .badge__pulse {
      width: 6px; height: 6px;
      background: var(--green);
      border-radius: 50%;
      box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.25);
      animation: pulse 1.6s ease-in-out infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

    /* ============================================================
       HERO
       ============================================================ */
    .hero {
      padding: 72px 0 40px;
      position: relative;
      overflow: hidden;
    }
    .hero::before {
      content: '';
      position: absolute;
      top: -200px; left: 50%;
      transform: translateX(-50%);
      width: 900px; height: 500px;
      background: radial-gradient(ellipse at center, rgba(212, 175, 55, 0.06) 0%, transparent 70%);
      pointer-events: none;
    }
    @media (max-width: 720px) { .hero { padding: 40px 0 32px; } }

    .hero__grid {
      display: grid;
      grid-template-columns: 1.15fr 1fr;
      gap: 56px;
      align-items: center;
      position: relative;
      z-index: 1;
    }
    @media (max-width: 900px) {
      .hero__grid { grid-template-columns: 1fr; gap: 40px; }
      .hero__product { order: -1; }
    }

    .hero__meta {
      display: flex; gap: 8px; margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .h-display {
      margin: 0 0 20px;
      font-size: clamp(36px, 5vw, 56px);
      line-height: 1.05;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--text);
    }

    .h-lead {
      margin: 0 0 32px;
      font-size: 17px;
      line-height: 1.55;
      color: var(--text-muted);
      max-width: 520px;
    }
    .h-lead-sm { font-size: 15px; margin: 8px 0 0; color: var(--text-muted); }

    /* ============ Stats ============ */
    .stats {
      display: flex;
      align-items: stretch;
      gap: 28px;
      padding: 24px 0;
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      margin-bottom: 28px;
    }
    .stat { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .stat__value {
      font-size: 24px;
      font-weight: 700;
      color: var(--text);
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .stat__label {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 500;
    }
    .stat__sep {
      width: 1px;
      background: var(--border);
    }
    @media (max-width: 540px) {
      .stats { flex-wrap: wrap; gap: 20px; }
      .stat__sep { display: none; }
      .stat { min-width: 45%; }
    }

    /* ============ Progress ============ */
    .progress { margin-bottom: 32px; }
    .progress__track {
      height: 6px;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 999px;
      overflow: hidden;
    }
    .progress__bar {
      height: 100%;
      background: linear-gradient(90deg, var(--gold) 0%, var(--gold-hover) 100%);
      border-radius: 999px;
      transition: width 400ms ease;
    }
    .progress__meta {
      display: flex; justify-content: space-between;
      margin-top: 10px;
      font-size: 12px;
      color: var(--text);
    }

    .cta-row {
      display: flex; gap: 10px; flex-wrap: wrap;
    }

    /* ============ Product card (hero right) ============ */
    .hero__product { display: flex; justify-content: center; }
    .product-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--r-xl);
      padding: 20px;
      width: 100%;
      max-width: 460px;
      box-shadow: var(--shadow-md);
      position: relative;
      overflow: hidden;
      transition: border-color var(--t-med);
    }
    .product-card:hover { border-color: var(--border-strong); }
    .product-card__label {
      display: inline-flex;
      padding: 4px 10px;
      background: var(--gold-soft);
      color: var(--gold);
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 16px;
      letter-spacing: 0.02em;
    }
    .product-card__media {
      background:
        radial-gradient(ellipse at center, rgba(212, 175, 55, 0.08) 0%, transparent 60%),
        var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: 24px;
      display: flex;
      justify-content: center;
      align-items: center;
      aspect-ratio: 4 / 3;
      margin-bottom: 16px;
    }
    .product-card__media img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      transition: transform 500ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    .product-card:hover .product-card__media img { transform: scale(1.03); }
    .product-card__body h3 {
      margin: 0 0 6px;
      font-size: 17px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .product-card__body p {
      margin: 0;
      font-size: 13px;
      display: inline-flex; align-items: center; gap: 6px;
    }
    .product-card__body .material-icons-outlined { font-size: 16px; }
    .product-card--empty .product-card__body { padding: 40px 0; text-align: center; }

    /* ============================================================
       COUNTDOWN
       ============================================================ */
    .countdown-wrap {
      padding: 8px 0 32px;
    }
    .countdown {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 32px;
      padding: 24px 28px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
    }
    @media (max-width: 720px) {
      .countdown { flex-direction: column; align-items: flex-start; padding: 20px; gap: 20px; }
    }
    .countdown__title {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 13px;
      color: var(--text-muted);
      font-weight: 500;
    }
    .countdown__title .material-icons-outlined { font-size: 16px; color: var(--gold); }
    .countdown__values {
      display: flex; gap: 24px;
    }
    @media (max-width: 480px) { .countdown__values { gap: 14px; } }
    .cd-unit {
      display: flex; flex-direction: column; align-items: center;
      min-width: 56px;
    }
    .cd-unit__value {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
      color: var(--text);
      line-height: 1;
    }
    .cd-unit__label {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-top: 6px;
      font-weight: 600;
    }

    /* ============================================================
       SECTION patterns
       ============================================================ */
    .section { padding: 80px 0; }
    @media (max-width: 720px) { .section { padding: 56px 0; } }

    .section__head {
      margin-bottom: 40px;
      max-width: 640px;
    }
    .section__head .pill { margin-bottom: 14px; }

    .h-section {
      margin: 0;
      font-size: clamp(24px, 3vw, 34px);
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.15;
    }

    /* ============================================================
       PICKER — Selector de boletas (protagonista)
       ============================================================ */
    .picker {
      padding: 40px 0 120px;
      position: relative;
    }

    .picker__head {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 24px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    .picker__head h2 { margin: 12px 0 6px; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
    .picker__head p { margin: 0; font-size: 14px; }

    .legend {
      display: flex; flex-wrap: wrap;
      gap: 6px;
    }
    .legend__item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 500;
    }
    .legend__dot {
      width: 8px; height: 8px;
      border-radius: 3px;
    }
    .legend__dot--available { background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); }
    .legend__dot--selected { background: var(--gold); box-shadow: 0 0 6px var(--gold); }
    .legend__dot--reserved { background: var(--amber); }
    .legend__dot--sold { background: var(--red); opacity: 0.5; }

    /* ============ Search inline ============ */
    .search {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      padding: 6px 6px 6px 14px;
      margin-bottom: 24px;
      transition: border-color var(--t-fast);
    }
    .search:focus-within {
      border-color: var(--gold);
      box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.14);
    }
    .search__icon {
      color: var(--text-dim);
      font-size: 20px;
    }
    .search__input {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text);
      font-size: 15px;
      padding: 10px 4px;
      outline: none;
      font-family: inherit;
      font-variant-numeric: tabular-nums;
      -webkit-appearance: none;
      appearance: none;
      -moz-appearance: textfield;
    }
    .search__input::-webkit-outer-spin-button,
    .search__input::-webkit-inner-spin-button {
      -webkit-appearance: none; margin: 0;
    }
    .search__input::placeholder { color: var(--text-dim); }

    /* ============ Search result card ============ */
    .search-result {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 16px 18px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      margin-bottom: 20px;
      position: relative;
    }
    .search-result[data-status="available"] { border-color: rgba(22, 163, 74, 0.35); }
    .search-result[data-status="available"] .search-result__icon { color: var(--green); }
    .search-result[data-status="sold"] { border-color: rgba(239, 68, 68, 0.35); }
    .search-result[data-status="sold"] .search-result__icon { color: var(--red); }
    .search-result[data-status="reserved"] { border-color: rgba(245, 158, 11, 0.35); }
    .search-result[data-status="reserved"] .search-result__icon { color: var(--amber); }
    .search-result[data-status="assigned"] { border-color: rgba(59, 130, 246, 0.35); }
    .search-result[data-status="assigned"] .search-result__icon { color: var(--blue); }
    .search-result__icon { font-size: 22px; margin-top: 2px; flex-shrink: 0; }
    .search-result__body { flex: 1; min-width: 0; }
    .search-result__body strong { display: block; font-size: 14px; margin-bottom: 4px; }
    .search-result__body p { margin: 0; font-size: 13px; color: var(--text-muted); }
    .search-result__actions { display: flex; gap: 8px; flex-shrink: 0; }
    .search-result__close {
      background: transparent;
      border: none;
      color: var(--text-dim);
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      display: grid; place-items: center;
    }
    .search-result__close:hover { color: var(--text); background: rgba(255,255,255,0.06); }
    .search-result__close .material-icons-outlined { font-size: 18px; }
    @media (max-width: 640px) {
      .search-result { flex-wrap: wrap; }
      .search-result__actions { width: 100%; }
      .search-result__actions .btn { flex: 1; }
    }

    /* ============================================================
       GRID de boletas — protagonista
       ============================================================ */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
      gap: 8px;
    }
    .grid--skeleton { pointer-events: none; }

    .ticket {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      padding: 16px 8px;
      font-family: inherit;
      color: var(--text);
      font-weight: 600;
      font-size: 15px;
      font-variant-numeric: tabular-nums;
      cursor: pointer;
      transition: transform var(--t-fast), background var(--t-fast),
                  border-color var(--t-fast), box-shadow var(--t-fast);
      overflow: hidden;
    }
    .ticket__number { position: relative; z-index: 1; }
    .ticket__check {
      position: absolute;
      top: 6px; right: 6px;
      color: var(--bg);
      font-size: 14px;
      background: var(--gold);
      border-radius: 50%;
      width: 18px; height: 18px;
      display: grid; place-items: center;
      z-index: 2;
    }

    /* Estado disponible: default */
    .ticket--available:hover {
      background: var(--card-hover);
      border-color: var(--border-strong);
      transform: translateY(-1px);
    }

    /* Estado seleccionado */
    .ticket--selected {
      background: linear-gradient(180deg, rgba(212, 175, 55, 0.14) 0%, rgba(212, 175, 55, 0.06) 100%);
      border-color: var(--gold);
      color: var(--text);
      box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.12);
    }
    .ticket--selected:hover { background: rgba(212, 175, 55, 0.18); }

    /* Estado reservado (visual, no clickable en el pool público) */
    .ticket--reserved {
      background: var(--surface);
      color: var(--text-dim);
      cursor: not-allowed;
      border-color: rgba(245, 158, 11, 0.2);
    }
    .ticket--reserved::after {
      content: '';
      position: absolute;
      top: 6px; right: 6px;
      width: 6px; height: 6px;
      background: var(--amber);
      border-radius: 50%;
    }

    /* Estado vendido */
    .ticket--sold {
      background: transparent;
      color: var(--text-dim);
      cursor: not-allowed;
      border-style: dashed;
      border-color: var(--border);
      text-decoration: line-through;
    }

    /* Pulse animation */
    .ticket--pulse {
      animation: ticket-pulse 1.4s ease-in-out 2;
    }
    @keyframes ticket-pulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.12); }
      50% { transform: scale(1.06); box-shadow: 0 0 0 8px rgba(212, 175, 55, 0.18); }
    }

    /* Skeleton */
    .ticket--skeleton {
      background: linear-gradient(90deg, var(--surface) 0%, var(--card-hover) 50%, var(--surface) 100%);
      background-size: 200% 100%;
      animation: skel 1.4s linear infinite;
      border: 1px solid var(--border);
      height: 54px;
      cursor: default;
    }
    @keyframes skel { to { background-position: -200% 0; } }

    /* Empty state */
    .empty {
      text-align: center;
      padding: 80px 20px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
    }
    .empty__icon { font-size: 44px; color: var(--text-dim); margin-bottom: 12px; display: block; }
    .empty h3 { margin: 0 0 6px; font-size: 17px; font-weight: 600; }
    .empty p { margin: 0; font-size: 14px; }

    /* ============ Bottom bar (sticky) ============ */
    .picker__bar {
      position: sticky;
      bottom: 16px;
      z-index: 30;
      margin-top: 32px;
      padding: 0 24px;
    }
    .picker__bar-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 16px 20px;
      background: rgba(27, 28, 32, 0.85);
      backdrop-filter: saturate(180%) blur(20px);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      border: 1px solid var(--border-strong);
      border-radius: var(--r-lg);
      box-shadow: var(--shadow-lg);
    }
    .picker__bar-info {
      display: flex; flex-direction: column; gap: 2px;
    }
    .picker__bar-count { font-size: 13px; color: var(--text-muted); font-weight: 500; }
    .picker__bar-total { font-size: 17px; font-weight: 600; }
    .picker__bar-total strong { color: var(--text); font-weight: 700; }
    @media (max-width: 540px) {
      .picker__bar-inner { padding: 12px 14px; }
      .picker__bar-info { flex: 1; }
      .picker__bar-inner .btn { padding: 12px 16px; font-size: 13px; }
    }

    /* ============================================================
       PRIZES grid — cards Stripe-style
       ============================================================ */
    .prizes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }
    .prize-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: 24px;
      transition: border-color var(--t-med), transform var(--t-med);
    }
    .prize-card:hover {
      border-color: var(--border-strong);
      transform: translateY(-2px);
    }
    .prize-card--top {
      background:
        radial-gradient(ellipse at top right, rgba(212, 175, 55, 0.08) 0%, transparent 60%),
        var(--card);
      border-color: rgba(212, 175, 55, 0.3);
    }
    .prize-card__head {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 20px;
    }
    .prize-card__num {
      font-size: 12px;
      font-weight: 700;
      color: var(--text-muted);
      letter-spacing: 0.06em;
      font-variant-numeric: tabular-nums;
    }
    .prize-card--top .prize-card__num { color: var(--gold); }
    .prize-card__tag {
      padding: 3px 10px;
      background: var(--gold-soft);
      color: var(--gold);
      border-radius: 999px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .prize-card__title {
      margin: 0 0 12px;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.01em;
      line-height: 1.3;
    }
    .prize-card__meta {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--text-muted);
      font-size: 13px;
    }
    .prize-card__meta .material-icons-outlined { font-size: 16px; }

    /* ============================================================
       STEPS — 3 cards
       ============================================================ */
    .steps {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    @media (max-width: 900px) { .steps { grid-template-columns: 1fr; } }
    .step {
      position: relative;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: 28px 24px;
      transition: border-color var(--t-med);
    }
    .step:hover { border-color: var(--border-strong); }
    .step__icon {
      display: grid; place-items: center;
      width: 44px; height: 44px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 20px;
    }
    .step__icon .material-icons-outlined { font-size: 22px; color: var(--gold); }
    .step__num {
      position: absolute;
      top: 24px; right: 24px;
      font-size: 12px;
      font-weight: 700;
      color: var(--text-dim);
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.05em;
    }
    .step h3 { margin: 0 0 8px; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
    .step p { margin: 0; font-size: 14px; line-height: 1.6; }

    /* ============================================================
       FAQ
       ============================================================ */
    .faq { display: flex; flex-direction: column; gap: 8px; }
    .faq__item {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      overflow: hidden;
      transition: border-color var(--t-fast);
    }
    .faq__item:hover { border-color: var(--border-strong); }
    .faq__item[open] { border-color: var(--border-strong); }
    .faq__q {
      display: flex; justify-content: space-between; align-items: center;
      padding: 20px 24px;
      cursor: pointer;
      font-size: 15px;
      font-weight: 500;
      list-style: none;
      user-select: none;
    }
    .faq__q::-webkit-details-marker { display: none; }
    .faq__chev {
      font-size: 20px;
      color: var(--text-muted);
      transition: transform var(--t-med);
    }
    .faq__item[open] .faq__chev { transform: rotate(180deg); color: var(--gold); }
    .faq__a {
      padding: 0 24px 20px;
      color: var(--text-muted);
      font-size: 14px;
      line-height: 1.65;
    }
    .faq__a p { margin: 0; }

    /* ============================================================
       FOOTER
       ============================================================ */
    .foot {
      margin-top: auto;
      padding: 40px 0 32px;
      border-top: 1px solid var(--border);
    }
    .foot__inner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
      font-size: 13px;
      color: var(--text-muted);
    }
    .foot__brand {
      display: inline-flex; align-items: center; gap: 8px;
      color: var(--text);
      font-weight: 600;
    }
    .foot__meta { display: inline-flex; gap: 8px; flex-wrap: wrap; }
    .foot__sep { color: var(--text-dim); }

    /* ============================================================
       BOTONES
       ============================================================ */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 10px 18px;
      border: 1px solid transparent;
      border-radius: 10px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.005em;
      cursor: pointer;
      transition: background var(--t-fast), color var(--t-fast),
                  border-color var(--t-fast), transform var(--t-fast),
                  box-shadow var(--t-fast);
      white-space: nowrap;
      text-decoration: none;
    }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn .material-icons-outlined { font-size: 18px; }
    .btn--sm { padding: 7px 12px; font-size: 13px; border-radius: 8px; }
    .btn--lg { padding: 13px 22px; font-size: 15px; border-radius: 12px; }
    .btn--block { width: 100%; }

    .btn--gold {
      background: var(--gold);
      color: #1a1300;
      box-shadow: 0 4px 12px rgba(212, 175, 55, 0.18);
    }
    .btn--gold:hover:not(:disabled) {
      background: var(--gold-hover);
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(212, 175, 55, 0.3);
    }
    .btn--gold:active:not(:disabled) { transform: translateY(0); }
    .btn--gold .material-icons-outlined { color: #1a1300; }

    .btn--ghost {
      background: transparent;
      border-color: var(--border-strong);
      color: var(--text);
    }
    .btn--ghost:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.04);
      border-color: var(--text-dim);
    }

    .btn__spin {
      display: inline-block;
      width: 14px; height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: currentColor;
      border-radius: 50%;
      animation: spin 700ms linear infinite;
    }

    .icon-btn {
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 10px;
      width: 36px; height: 36px;
      display: grid; place-items: center;
      cursor: pointer;
      color: var(--text-muted);
      transition: background var(--t-fast), color var(--t-fast);
    }
    .icon-btn:hover { background: rgba(255,255,255,0.05); color: var(--text); }
    .icon-btn .material-icons-outlined { font-size: 18px; }

    /* ============================================================
       FORMULARIO
       ============================================================ */
    .form { display: flex; flex-direction: column; gap: 16px; margin-top: 24px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field__label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      letter-spacing: 0.02em;
    }
    .field__label small {
      font-size: 11px;
      color: var(--text-dim);
      font-weight: 500;
      margin-left: 4px;
    }
    .input {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      padding: 12px 14px;
      color: var(--text);
      font-family: inherit;
      font-size: 15px;
      transition: border-color var(--t-fast), box-shadow var(--t-fast);
      outline: none;
      -webkit-text-fill-color: var(--text);
    }
    .input::placeholder { color: var(--text-dim); }
    .input:focus {
      border-color: var(--gold);
      box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.14);
    }
    .input:-webkit-autofill,
    .input:-webkit-autofill:hover,
    .input:-webkit-autofill:focus {
      -webkit-box-shadow: 0 0 0 40px var(--surface) inset !important;
      -webkit-text-fill-color: var(--text) !important;
      caret-color: var(--text);
    }

    .or {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 4px 0;
      color: var(--text-dim);
      font-size: 12px;
    }
    .or::before, .or::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border);
    }

    .alert {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 14px; margin-top: 12px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      border-radius: var(--r-md);
      font-size: 13px;
    }
    .alert .material-icons-outlined { font-size: 18px; }

    /* ============================================================
       MODAL
       ============================================================ */
    .modal {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      z-index: 100;
      animation: fadeIn 200ms ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .modal__card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--r-xl);
      padding: 28px;
      max-width: 480px;
      width: 100%;
      max-height: 92vh;
      overflow-y: auto;
      box-shadow: var(--shadow-lg);
      animation: modalIn 240ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    .modal__card--wide { max-width: 620px; padding: 24px; }
    @keyframes modalIn {
      from { opacity: 0; transform: translateY(12px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .modal__head {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 16px;
      margin-bottom: 20px;
    }
    .modal__head h2 { margin: 8px 0 4px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
    .modal__head p { margin: 0; font-size: 13px; }
    .modal__actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
    }

    /* ============ Preview ticket ============ */
    .preview-ticket {
      display: flex;
      justify-content: center;
      padding: 8px 0;
    }
  `],
})
export class PublicPurchaseComponent implements OnInit, OnDestroy {
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

  searchInput = '';
  searching = signal(false);
  searchResult = signal<TicketLookup | null>(null);
  pulseTicketId = signal<number | null>(null);

  previewOpen = signal(false);
  previewLoading = signal(false);
  previewData = signal<PublicTicketDetail | null>(null);
  previewTicketId = signal<number | null>(null);

  // Countdown reactivo — se actualiza cada segundo
  countdown = signal<{ days: string; hours: string; minutes: string; seconds: string } | null>(null);
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  skeletonRange = Array.from({ length: 30 }, (_, i) => i);

  faq = [
    {
      q: '¿Cómo garantizan la transparencia del sorteo?',
      a: 'El sorteo se realiza con la lotería oficial anunciada en la rifa. Los números y fechas quedan registrados en la plataforma antes del sorteo y son verificables públicamente con el QR de cada boleta.',
    },
    {
      q: '¿Qué métodos de pago aceptan?',
      a: 'Nequi, PSE, Bancolombia y tarjeta de crédito/débito a través de Wompi. También transferencia manual con comprobante que el organizador aprueba en menos de 24 horas.',
    },
    {
      q: '¿Cuánto tiempo tengo para pagar mi boleta reservada?',
      a: 'Al elegir una boleta la reservamos por 24 horas. Recibirás un recordatorio antes de que expire. Si no pagas, la boleta vuelve a estar disponible para otros compradores.',
    },
    {
      q: '¿Cómo sabré si gané?',
      a: 'Después del sorteo te notificamos por correo electrónico y WhatsApp automáticamente. También puedes verificar el resultado desde el enlace de tu boleta.',
    },
    {
      q: '¿Mis datos personales están seguros?',
      a: 'Sí. Solo pedimos la información mínima para entregarte el premio si ganas. No compartimos tu información con terceros ni la usamos para publicidad.',
    },
    {
      q: '¿Puedo comprar varias boletas?',
      a: 'Sí, puedes seleccionar hasta 10 boletas por compra. Si quieres más, puedes hacer múltiples compras.',
    },
  ];

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

  availableCount = computed(() => this.available().length);

  searchPlaceholder = computed(() => {
    const r = this.overview();
    if (!r) return '2565';
    const example = Math.floor(r.total_tickets * 0.42) || 100;
    return String(example);
  });

  topPrizeName = computed(() => {
    const r = this.overview();
    if (!r?.prizes?.length) return '';
    return [...r.prizes].sort((a, b) => a.position - b.position)[0].name;
  });

  previewTicket = computed(() => {
    const pd = this.previewData();
    if (!pd) return null;
    return {
      id: 0,
      raffle_id: pd.raffle.id,
      number_label: pd.ticket.label,
      code: pd.ticket.code,
      status: 'available' as const,
      seller_id: null,
      customer_id: null,
      numbers: pd.ticket.numbers.map((n, idx) => ({ number: n, position: idx })),
    };
  });

  previewPrizes = computed(() => {
    const pd = this.previewData();
    if (!pd) return [];
    return pd.prizes.map((p, idx) => ({
      position: idx + 1,
      name: p.name,
      draw_date: p.draw_date,
      winning_number: p.winning_number,
    }));
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) {
      this.error.set('URL inválida');
      this.loading.set(false);
      return;
    }
    this.raffleId = id;

    const ref = this.route.snapshot.queryParamMap.get('ref');
    if (ref) {
      try { localStorage.setItem('boletera_referral_code', ref); } catch {}
    }

    this.svc.overview(id).subscribe({
      next: (r) => {
        this.overview.set(r);
        this.loading.set(false);
        this.loadAvailable();
        this.startCountdown(r);
      },
      error: (e) => {
        this.error.set(e?.error?.detail ?? 'No se pudo cargar la rifa');
        this.loading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
  }

  private startCountdown(r: PublicRaffleOverview) {
    // Solo mostramos el countdown si la fecha está pública (threshold alcanzado o programada)
    if (!r.show_draw_date || !r.final_draw_date) return;

    const target = new Date(r.final_draw_date + (r.final_draw_date.length === 10 ? 'T20:00:00' : '')).getTime();
    if (isNaN(target)) return;

    const tick = () => {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) {
        this.countdown.set(null);
        if (this.countdownInterval) clearInterval(this.countdownInterval);
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      this.countdown.set({
        days: String(days).padStart(2, '0'),
        hours: String(hours).padStart(2, '0'),
        minutes: String(minutes).padStart(2, '0'),
        seconds: String(seconds).padStart(2, '0'),
      });
    };
    tick();
    this.countdownInterval = setInterval(tick, 1000);
  }

  loadAvailable() {
    this.loadingTickets.set(true);
    this.svc.availableTickets(this.raffleId).subscribe({
      next: (list) => { this.available.set(list); this.loadingTickets.set(false); },
      error: () => this.loadingTickets.set(false),
    });
  }

  isSelected(id: number | null): boolean { return id != null && this.selected().has(id); }

  toggle(id: number) {
    const set = new Set(this.selected());
    if (set.has(id)) set.delete(id);
    else if (set.size < 10) set.add(id);
    this.selected.set(set);
  }

  removeFromSelection(id: number) {
    const set = new Set(this.selected());
    set.delete(id);
    this.selected.set(set);
  }

  openTicketPreview(t: AvailableTicket) {
    this.previewTicketId.set(t.id);
    this.previewOpen.set(true);
    this.previewLoading.set(true);
    this.previewData.set(null);
    this.svc.ticketDetail(t.code).subscribe({
      next: (d) => { this.previewData.set(d); this.previewLoading.set(false); },
      error: () => { this.previewLoading.set(false); this.closePreview(); },
    });
  }

  openTicketPreviewById(ticketId: number) {
    const t = this.available().find((x) => x.id === ticketId);
    if (t) this.openTicketPreview(t);
  }

  closePreview() {
    this.previewOpen.set(false);
    this.previewData.set(null);
    this.previewTicketId.set(null);
  }

  selectAndClosePreview() {
    const id = this.previewTicketId();
    if (id != null) this.toggle(id);
    this.closePreview();
  }

  reserveAndCheckoutNow() {
    const id = this.previewTicketId();
    if (id == null) return;
    if (!this.selected().has(id)) {
      const set = new Set(this.selected());
      set.add(id);
      this.selected.set(set);
    }
    this.closePreview();
    setTimeout(() => this.openCheckout(), 100);
  }

  doSearch() {
    const q = String(this.searchInput ?? '').trim();
    if (!q || this.searching()) return;
    this.searching.set(true);
    this.searchResult.set(null);
    this.svc.lookupTicket(this.raffleId, q).subscribe({
      next: (res) => {
        this.searchResult.set(res);
        this.searching.set(false);
        if (res.status === 'available' && res.ticket_id != null) {
          setTimeout(() => this.scrollToTicket(res.ticket_id!), 100);
        }
      },
      error: () => {
        this.searching.set(false);
        this.searchResult.set({
          status: 'not_found', number_label: q, ticket_id: null,
          message: 'No pudimos buscar ese número.',
        });
      },
    });
  }

  clearSearch() {
    this.searchResult.set(null);
    this.searchInput = '';
  }

  selectFromSearch(ticketId: number) {
    const set = new Set(this.selected());
    if (!set.has(ticketId) && set.size < 10) {
      set.add(ticketId);
      this.selected.set(set);
    }
    this.scrollToTicket(ticketId);
  }

  scrollToGrid() {
    document.getElementById('grid-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  scrollToPrizes() {
    document.getElementById('prizes-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private scrollToTicket(ticketId: number) {
    const el = document.getElementById('ticket-' + ticketId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.pulseTicketId.set(ticketId);
      setTimeout(() => this.pulseTicketId.set(null), 3000);
    }
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
    try { referralCode = localStorage.getItem('boletera_referral_code') || undefined; } catch {}

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
        try {
          localStorage.setItem(`boletera_tx_${resp.reference}`, JSON.stringify({
            ticket_labels: resp.ticket_labels,
            total_cents: resp.total_amount_cents,
            expires_at: resp.reservation_expires_at,
            raffle_id: this.raffleId,
          }));
        } catch {}
        if (resp.checkout_url) window.location.href = resp.checkout_url;
        else this.router.navigate(['/rifa', this.raffleId, 'pago', resp.reference]);
      },
      error: (e) => {
        this.submitError.set(e?.error?.detail ?? 'No se pudo iniciar el checkout');
        this.submitting.set(false);
      },
    });
  }

  switchManual() {
    alert('Transferencia manual: pronto disponible. Contacta al organizador por WhatsApp.');
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
