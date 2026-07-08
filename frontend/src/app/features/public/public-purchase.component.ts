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
 * Portal PÚBLICO — v5 landing SaaS verde inspirado en el brand Boletera.
 *
 * Paleta verde oscuro con acento verde brillante. Layout tipo Vercel /
 * Framer con card de boleta flotante sobre el TV en el hero,
 * stats bar horizontal con countdown, grid de premios con productos,
 * pasos numerados y features cards.
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
          <div class="container topbar__inner">
            <a routerLink="/" class="brand">
              <span class="brand__logo">
                <svg viewBox="0 0 32 32" width="32" height="32">
                  <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#brandg)"/>
                  <path d="M10 12h9a3 3 0 0 1 0 6h-9zm0 6h11a3 3 0 0 1 0 6H10z"
                        fill="#0a2820" stroke="#0a2820" stroke-width="0.5"/>
                  <defs>
                    <linearGradient id="brandg" x1="0" y1="0" x2="32" y2="32">
                      <stop offset="0" stop-color="#22e695"/>
                      <stop offset="1" stop-color="#0eaa66"/>
                    </linearGradient>
                  </defs>
                </svg>
              </span>
              <span class="brand__name">Boletera</span>
            </a>

            <nav class="topbar__nav">
              <a class="nav-link" (click)="scrollTo('prizes')">Premios</a>
              <a class="nav-link" (click)="scrollTo('how')">Cómo funciona</a>
              <a class="nav-link" (click)="scrollTo('faq')">Preguntas</a>
              <a class="nav-link" (click)="scrollTo('grid')">Verificar boleta</a>
            </nav>

            <div class="topbar__actions">
              <button class="btn btn--primary btn--sm topbar__cta" (click)="scrollTo('grid')">
                <span class="material-icons-outlined">confirmation_number</span>
                <span class="topbar__cta-label">Comprar boleta</span>
              </button>
            </div>
          </div>
        </header>

        <!-- ============ HERO ============ -->
        <section class="hero">
          <div class="hero__bg" aria-hidden="true"></div>
          <div class="container hero__grid">
            <div class="hero__content">
              <div class="hero__badge">
                <span class="hero__badge-dot"></span>
                <span>Hecho en Colombia · Rifa activa</span>
              </div>

              <h1 class="hero__title">
                @if (heroTitleParts(); as ht) {
                  <span>{{ ht.left }}</span>@if (ht.right) {<em>{{ ht.right }}</em>}
                } @else {
                  {{ r.name }}
                }
              </h1>

              <p class="hero__desc">
                {{ r.description || 'Compra tu boleta con transparencia total: boletas únicas con QR, verificación pública, pagos con comprobante y notificación automática al ganador. Sin filas, sin trámites.' }}
              </p>

              <div class="hero__ctas">
                <button class="btn btn--primary btn--lg" (click)="scrollTo('grid')">
                  <span class="material-icons-outlined">rocket_launch</span>
                  Comprar mi boleta
                </button>
                <button class="btn btn--play btn--lg" (click)="scrollTo('how')">
                  <span class="hero__play-icon">
                    <span class="material-icons-outlined">play_arrow</span>
                  </span>
                  Ver cómo funciona
                </button>
              </div>

              <ul class="hero__bullets">
                <li><span class="material-icons-outlined">check</span> Boletas únicas con QR</li>
                <li><span class="material-icons-outlined">check</span> Verificación pública</li>
                <li><span class="material-icons-outlined">check</span> Pago 100% seguro</li>
              </ul>
            </div>

            <aside class="hero__stage">
              <div class="stage__product">
                @if (r.logo_url) {
                  <img [src]="r.logo_url" [alt]="topPrizeName()" />
                } @else {
                  <div class="stage__fallback">📺</div>
                }
              </div>

              <!-- Card flotante de boleta ejemplo -->
              <div class="ticket-card">
                <div class="ticket-card__head">
                  <span class="ticket-card__label">Nº {{ sampleTicket().label }}</span>
                  <span class="ticket-card__code">{{ sampleTicket().code }}</span>
                </div>
                <div class="ticket-card__grid">
                  @for (n of sampleTicket().numbers; track $index) {
                    <span class="ticket-card__num">{{ n }}</span>
                  }
                </div>
                <div class="ticket-card__foot">
                  @if (r.final_draw_date && r.show_draw_date) {
                    Sorteo final · {{ formatDateShort(r.final_draw_date) }}
                  } @else {
                    Sorteo con {{ r.lottery_name || 'Lotería oficial' }}
                  }
                </div>
              </div>
            </aside>
          </div>
        </section>

        <!-- ============ STATS BAR ============ -->
        <section class="statsbar-wrap">
          <div class="container">
            <div class="statsbar">
              <div class="statsbar__stat">
                <div class="stat-icon">
                  <span class="material-icons-outlined">confirmation_number</span>
                </div>
                <div>
                  <div class="stat-value">{{ r.total_tickets }}</div>
                  <div class="stat-label">Boletas totales</div>
                </div>
              </div>

              <div class="statsbar__stat">
                <div class="stat-icon">
                  <span class="material-icons-outlined">shopping_bag</span>
                </div>
                <div>
                  <div class="stat-value">{{ soldCount() }}</div>
                  <div class="stat-label">Boletas vendidas</div>
                </div>
              </div>

              <div class="statsbar__stat">
                <div class="stat-icon">
                  <span class="material-icons-outlined">inventory_2</span>
                </div>
                <div>
                  <div class="stat-value">{{ availableCount() }}</div>
                  <div class="stat-label">Disponibles</div>
                </div>
              </div>

              <div class="statsbar__progress">
                <div class="statsbar__progress-head">
                  <span class="statsbar__progress-pct">{{ r.sold_pct }}% vendido</span>
                </div>
                <div class="statsbar__progress-track">
                  <div class="statsbar__progress-bar" [style.width.%]="r.sold_pct"></div>
                </div>
                <div class="statsbar__progress-note">¡No te quedes por fuera!</div>
              </div>

              @if (countdown(); as c) {
                <div class="statsbar__countdown">
                  <div class="cd-title">Sorteo en:</div>
                  <div class="cd-values">
                    <div class="cd-unit"><span>{{ c.days }}</span><small>Días</small></div>
                    <span class="cd-sep">:</span>
                    <div class="cd-unit"><span>{{ c.hours }}</span><small>Horas</small></div>
                    <span class="cd-sep">:</span>
                    <div class="cd-unit"><span>{{ c.minutes }}</span><small>Minutos</small></div>
                    <span class="cd-sep">:</span>
                    <div class="cd-unit"><span>{{ c.seconds }}</span><small>Segundos</small></div>
                  </div>
                </div>
              }
            </div>
          </div>
        </section>

        <!-- ============ PREMIOS ============ -->
        @if (r.prizes.length) {
          <section class="section" id="prizes">
            <div class="container">
              <div class="section-head-row">
                <div>
                  <h2 class="h-section">Premios increíbles</h2>
                  <p class="muted">Cada boleta juega por todos los premios en diferentes fechas.</p>
                </div>
                <a class="link-arrow" (click)="scrollTo('grid')">
                  Ver todos <span class="material-icons-outlined">arrow_forward</span>
                </a>
              </div>

              <div class="prizes-grid">
                @for (p of r.prizes; track p.position; let idx = $index) {
                  <article class="prize-card" [class.prize-card--top]="idx === 0">
                    <div class="prize-card__head">
                      <span class="prize-card__num">
                        <span class="prize-card__num-hash">#</span>
                        <span>{{ (idx + 1) < 10 ? '0' : '' }}{{ idx + 1 }}</span>
                      </span>
                      @if (idx === 0) {
                        <span class="prize-card__ribbon">
                          <span class="material-icons-outlined">workspace_premium</span>
                          Mayor
                        </span>
                      }
                    </div>

                    <div class="prize-card__media">
                      @if (idx === 0 && r.logo_url) {
                        <img [src]="r.logo_url" [alt]="p.name" />
                      } @else if (prizeAmount(p.name); as amt) {
                        <div class="prize-money">
                          <span class="prize-money__currency">$</span>
                          <span class="prize-money__amount">{{ amt.value }}</span>
                          <span class="prize-money__unit">{{ amt.unit }}</span>
                        </div>
                        <div class="prize-money__label">En efectivo</div>
                      } @else {
                        <div class="prize-card__emoji">{{ prizeEmoji(p.name) }}</div>
                      }
                    </div>

                    <div class="prize-card__body">
                      <h3>{{ p.name }}</h3>
                      <div class="prize-card__meta">
                        <span class="prize-card__tier">
                          {{ idx === 0 ? 'Premio mayor' : idx === 1 ? 'Segundo premio' : idx === 2 ? 'Tercer premio' : 'Cuarto premio' }}
                        </span>
                        @if (p.draw_date) {
                          <span class="prize-card__date">
                            <span class="material-icons-outlined">event</span>
                            {{ formatDateShort(p.draw_date) }}
                          </span>
                        }
                      </div>
                    </div>
                  </article>
                }
              </div>
            </div>
          </section>
        }

        <!-- ============ CÓMO PARTICIPAR ============ -->
        <section class="section section--how" id="how">
          <div class="container">
            <div class="section-head">
              <h2 class="h-section">¿Cómo participar?</h2>
              <p class="muted">4 pasos simples para conseguir tu boleta.</p>
            </div>

            <div class="how-grid">
              <article class="how-step">
                <div class="how-step__icon-wrap">
                  <div class="how-step__icon">
                    <span class="material-icons-outlined">confirmation_number</span>
                  </div>
                  <div class="how-step__connector"></div>
                </div>
                <div class="how-step__num">1</div>
                <h3>Elige tus boletas</h3>
                <p class="muted">Selecciona la cantidad y tus números favoritos.</p>
              </article>

              <article class="how-step">
                <div class="how-step__icon-wrap">
                  <div class="how-step__icon">
                    <span class="material-icons-outlined">credit_card</span>
                  </div>
                  <div class="how-step__connector"></div>
                </div>
                <div class="how-step__num">2</div>
                <h3>Realiza tu pago</h3>
                <p class="muted">Pago 100% seguro en línea con Nequi, PSE o tarjeta.</p>
              </article>

              <article class="how-step">
                <div class="how-step__icon-wrap">
                  <div class="how-step__icon">
                    <span class="material-icons-outlined">verified</span>
                  </div>
                  <div class="how-step__connector"></div>
                </div>
                <div class="how-step__num">3</div>
                <h3>Recibe tu comprobante</h3>
                <p class="muted">Te llega al correo y WhatsApp con tu QR.</p>
              </article>

              <article class="how-step">
                <div class="how-step__icon-wrap">
                  <div class="how-step__icon">
                    <span class="material-icons-outlined">card_giftcard</span>
                  </div>
                </div>
                <div class="how-step__num">4</div>
                <h3>¡Ya estás participando!</h3>
                <p class="muted">Espera el sorteo en vivo y gana increíbles premios.</p>
              </article>
            </div>
          </div>
        </section>

        <!-- ============ SELECTOR DE BOLETAS ============ -->
        <section class="section section--picker" id="grid">
          <div class="container">
            <div class="section-head-row">
              <div>
                <h2 class="h-section">Elige tu boleta</h2>
                <p class="muted">Toca una boleta para ver su diseño. Puedes seleccionar hasta 10.</p>
              </div>
              <div class="legend">
                <span class="legend__item"><span class="dot dot--free"></span> Disponible</span>
                <span class="legend__item"><span class="dot dot--sel"></span> Seleccionada</span>
                <span class="legend__item"><span class="dot dot--res"></span> Reservada</span>
                <span class="legend__item"><span class="dot dot--sold"></span> Vendida</span>
              </div>
            </div>

            <form class="search" (ngSubmit)="doSearch()">
              <span class="search__icon material-icons-outlined">search</span>
              <input type="number" class="search__input"
                     [(ngModel)]="searchInput" name="searchInput"
                     [placeholder]="'Busca tu número (ej ' + searchPlaceholder() + ')'"
                     inputmode="numeric" />
              <button type="submit" class="btn btn--primary" [disabled]="searching()">
                @if (searching()) {
                  <span class="btn__spin"></span>
                } @else {
                  Buscar
                }
              </button>
            </form>
            <p class="search__hint muted">
              Escribe un número (ej: {{ searchPlaceholder() }}) y te decimos
              en qué boleta está jugando y si aún está disponible.
            </p>

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
                  @if (sr.status === 'not_found') {
                    <strong>Número {{ sr.matched_number }} no encontrado</strong>
                  } @else if (sr.status === 'available') {
                    <strong>
                      Número {{ sr.matched_number }} disponible en la boleta {{ sr.number_label }}
                    </strong>
                  } @else {
                    <strong>Boleta {{ sr.number_label }} no disponible</strong>
                  }
                  <p>{{ sr.message }}</p>
                </div>
                @if (sr.status === 'available' && sr.ticket_id) {
                  <div class="search-result__actions">
                    <button class="btn btn--ghost btn--sm"
                            (click)="openTicketPreviewById(sr.ticket_id!)">
                      Ver boleta
                    </button>
                    <button class="btn btn--primary btn--sm"
                            (click)="selectFromSearch(sr.ticket_id!)">
                      Reservar
                    </button>
                  </div>
                }
                <button class="search-result__close" (click)="clearSearch()" aria-label="Cerrar">
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
                <span class="material-icons-outlined empty__icon">inbox</span>
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

          @if (selected().size > 0) {
            <div class="picker__bar">
              <div class="container picker__bar-inner">
                <div class="picker__bar-info">
                  <div class="picker__bar-count">
                    {{ selected().size }} {{ selected().size === 1 ? 'boleta seleccionada' : 'boletas seleccionadas' }}
                  </div>
                  <div class="picker__bar-total">
                    Total <strong>\${{ formatNumber(totalPrice()) }}</strong>
                  </div>
                </div>
                <button class="btn btn--primary btn--lg" (click)="openCheckout()">
                  Continuar al pago
                  <span class="material-icons-outlined">arrow_forward</span>
                </button>
              </div>
            </div>
          }
        </section>

        <!-- ============ FEATURES ============ -->
        <section class="features-wrap">
          <div class="container">
            <div class="features">
              <div class="feature">
                <div class="feature__icon">
                  <span class="material-icons-outlined">verified_user</span>
                </div>
                <div>
                  <h3>Transparencia total</h3>
                  <p class="muted">Mostramos todo el proceso de forma pública.</p>
                </div>
              </div>

              <div class="feature">
                <div class="feature__icon">
                  <span class="material-icons-outlined">videocam</span>
                </div>
                <div>
                  <h3>Sorteos en vivo</h3>
                  <p class="muted">Transmisión en vivo por nuestras redes.</p>
                </div>
              </div>

              <div class="feature">
                <div class="feature__icon">
                  <span class="material-icons-outlined">workspace_premium</span>
                </div>
                <div>
                  <h3>Ganadores verificados</h3>
                  <p class="muted">Publicamos los ganadores con prueba y evidencia.</p>
                </div>
              </div>

              <div class="feature">
                <div class="feature__icon">
                  <span class="material-icons-outlined">support_agent</span>
                </div>
                <div>
                  <h3>Atención personalizada</h3>
                  <p class="muted">Estamos para ayudarte en todo momento.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ============ FAQ ============ -->
        <section class="section" id="faq">
          <div class="container container--narrow">
            <div class="section-head">
              <h2 class="h-section">Preguntas frecuentes</h2>
              <p class="muted">Todo lo que necesitas saber antes de comprar.</p>
            </div>
            <div class="faq">
              @for (q of faq; track q.q) {
                <details class="faq__item">
                  <summary class="faq__q">
                    <span>{{ q.q }}</span>
                    <span class="faq__chev material-icons-outlined">expand_more</span>
                  </summary>
                  <div class="faq__a"><p>{{ q.a }}</p></div>
                </details>
              }
            </div>
          </div>
        </section>

        <!-- ============ FOOTER ============ -->
        <footer class="foot">
          <div class="container foot__inner">
            <div class="foot__brand">
              <span class="brand__logo brand__logo--sm">
                <svg viewBox="0 0 32 32" width="24" height="24">
                  <rect x="2" y="2" width="28" height="28" rx="8" fill="#22c55e"/>
                  <path d="M10 12h9a3 3 0 0 1 0 6h-9zm0 6h11a3 3 0 0 1 0 6H10z" fill="#0a2820"/>
                </svg>
              </span>
              <span>Boletera</span>
            </div>
            <div class="foot__meta">
              @if (r.lottery_name) { <span>Juega con {{ r.lottery_name }}</span><span class="foot__sep">·</span> }
              <span>Compra segura</span>
              <span class="foot__sep">·</span>
              <span>Verificación pública</span>
            </div>
          </div>
        </footer>

        <!-- Botón flotante WhatsApp -->
        <a class="whatsapp-fab" [href]="whatsappHref()" target="_blank" rel="noopener"
           aria-label="Contactar por WhatsApp" title="Contactar por WhatsApp">
          <svg viewBox="0 0 32 32" width="28" height="28" fill="currentColor">
            <path d="M16 3C9.4 3 4 8.4 4 15c0 2.3.6 4.5 1.8 6.4L4 29l7.8-2.6c1.8 1 3.9 1.6 6.2 1.6h.1c6.6 0 12-5.4 12-12S22.6 3 16 3zm7 17.1c-.3.8-1.6 1.6-2.2 1.7-.6.1-1.3.1-2.1-.1-.5-.1-1.1-.3-1.9-.6-3.3-1.4-5.4-4.7-5.6-4.9-.2-.2-1.4-1.8-1.4-3.5s.9-2.5 1.2-2.8c.3-.3.7-.4.9-.4h.6c.2 0 .5 0 .7.5.3.6.9 2.1 1 2.3.1.1.1.3.1.5s-.1.4-.2.6c-.2.2-.3.4-.5.6-.2.2-.4.4-.2.7.2.3.9 1.4 1.9 2.3 1.3 1.1 2.4 1.5 2.7 1.6.3.2.5.1.7-.1.2-.2.8-1 1.1-1.3.3-.3.5-.3.9-.2.4.1 2.3 1.1 2.7 1.3.4.2.7.3.8.4.1.4.1.9-.2 1.4z"/>
          </svg>
        </a>

      }

      <!-- ============ MODAL PREVIEW ============ -->
      @if (previewOpen() && previewData(); as pd) {
        <div class="modal" (click)="closePreview()">
          <div class="modal__card modal__card--wide" (click)="$event.stopPropagation()">
            <div class="modal__head">
              <div>
                <div class="pill">Boleta {{ pd.ticket.label }}</div>
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
                [primaryColor]="pd.raffle.primary_color || '#22c55e'"
                [ticketPrice]="overview()?.ticket_price ?? null"
                [responsibleName]="pd.raffle.responsible_name"
                [responsiblePhone]="pd.raffle.responsible_phone" />
            </div>
            <div class="modal__actions">
              @if (isSelected(previewTicketId()!)) {
                <button class="btn btn--ghost btn--lg" (click)="removeFromSelection(previewTicketId()!)">
                  Quitar de la selección
                </button>
              } @else {
                <button class="btn btn--ghost btn--lg" (click)="selectAndClosePreview()">
                  Agregar a mi selección
                </button>
              }
              <button class="btn btn--primary btn--lg" (click)="reserveAndCheckoutNow()">
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
                <div class="pill">Checkout</div>
                <h2>Completar compra</h2>
                <p class="muted">
                  <strong>{{ selected().size }}</strong>
                  {{ selected().size === 1 ? 'boleta' : 'boletas' }} ·
                  Total <strong>\${{ formatNumber(totalPrice()) }}</strong>
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
                <button type="submit" class="btn btn--primary btn--lg btn--block"
                        [disabled]="submitting()">
                  @if (submitting()) {
                    <span class="btn__spin"></span> Redirigiendo…
                  } @else {
                    Pagar con Wompi
                    <span class="material-icons-outlined">arrow_forward</span>
                  }
                </button>
                <small class="muted center">Nequi · PSE · Bancolombia · Tarjeta</small>
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
       Paleta verde Boletera
       ============================================================ */
    :host {
      --bg:          #041613;
      --surface:     #082820;
      --surface-2:   #0a3126;
      --card:        rgba(10, 49, 38, 0.55);
      --card-solid:  #0a3126;
      --border:      rgba(34, 197, 94, 0.12);
      --border-md:   rgba(34, 197, 94, 0.22);
      --border-str:  rgba(34, 197, 94, 0.4);

      --text:        #ffffff;
      --text-muted:  #9dbdaa;
      --text-dim:    #6a8578;

      --brand:       #22c55e;
      --brand-glow:  #4ade80;
      --brand-soft:  rgba(34, 197, 94, 0.15);
      --brand-dark:  #16a34a;

      --amber:       #f59e0b;
      --red:         #ef4444;
      --blue:        #3b82f6;

      --shadow-sm:   0 2px 4px rgba(0,0,0,.3);
      --shadow-md:   0 8px 24px rgba(0,0,0,.3);
      --shadow-lg:   0 24px 60px rgba(0,0,0,.4);

      --r-sm: 10px;
      --r-md: 14px;
      --r-lg: 20px;
      --r-xl: 24px;

      --t-fast: 160ms cubic-bezier(0.4, 0, 0.2, 1);
      --t-med:  240ms cubic-bezier(0.4, 0, 0.2, 1);

      display: block;
      min-height: 100vh;
      background:
        radial-gradient(ellipse 100% 60% at 50% 0%, rgba(34, 197, 94, 0.16) 0%, transparent 70%),
        radial-gradient(ellipse 80% 40% at 100% 20%, rgba(34, 197, 94, 0.08) 0%, transparent 60%),
        var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
    }
    * { box-sizing: border-box; }

    .app { min-height: 100vh; display: flex; flex-direction: column; }

    .container { width: 100%; max-width: 1240px; margin: 0 auto; padding: 0 24px; }
    .container--narrow { max-width: 780px; }
    @media (max-width: 720px) { .container { padding: 0 18px; } }

    .muted { color: var(--text-muted); font-size: 14px; }
    .center { text-align: center; display: block; }

    .page-loader {
      display: grid; place-items: center;
      min-height: 100vh; gap: 20px;
    }
    .page-loader__spinner {
      width: 32px; height: 32px;
      border: 2px solid var(--border);
      border-top-color: var(--brand);
      border-radius: 50%;
      animation: spin 700ms linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ============================================================
       TOPBAR
       ============================================================ */
    .topbar {
      position: sticky; top: 0; z-index: 40;
      background: rgba(4, 22, 19, 0.72);
      backdrop-filter: saturate(180%) blur(20px);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      border-bottom: 1px solid var(--border);
    }
    .topbar__inner {
      display: flex; align-items: center;
      justify-content: space-between; gap: 16px;
      padding: 14px 24px;
    }
    @media (max-width: 720px) {
      .topbar__inner { padding: 12px 18px; }
      .topbar__cta { padding: 8px 12px; }
      .topbar__cta-label { display: none; }
      .topbar__cta .material-icons-outlined { font-size: 20px; }
    }
    .brand {
      display: inline-flex; align-items: center; gap: 10px;
      color: var(--text); text-decoration: none;
      font-weight: 700; font-size: 17px;
      letter-spacing: -0.02em;
    }
    .brand__logo { display: grid; place-items: center; }
    .brand__logo--sm svg { width: 22px; height: 22px; }

    .topbar__nav {
      display: flex; gap: 4px;
    }
    .nav-link {
      padding: 8px 14px;
      color: var(--text-muted);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 8px;
      transition: color var(--t-fast), background var(--t-fast);
    }
    .nav-link:hover { color: var(--text); background: rgba(255,255,255,0.04); }
    @media (max-width: 900px) { .topbar__nav { display: none; } }

    .topbar__actions { display: inline-flex; gap: 10px; }

    /* ============================================================
       BUTTONS
       ============================================================ */
    .btn {
      display: inline-flex; align-items: center; justify-content: center;
      gap: 8px;
      padding: 10px 18px;
      border: 1px solid transparent;
      border-radius: 12px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.005em;
      cursor: pointer;
      transition: transform var(--t-fast), background var(--t-fast),
                  color var(--t-fast), border-color var(--t-fast),
                  box-shadow var(--t-fast);
      white-space: nowrap;
      text-decoration: none;
    }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn .material-icons-outlined { font-size: 18px; }

    .btn--sm { padding: 8px 14px; font-size: 13px; border-radius: 10px; }
    .btn--lg { padding: 14px 24px; font-size: 15px; border-radius: 14px; }
    .btn--block { width: 100%; }

    .btn--primary {
      background: linear-gradient(180deg, #22e695 0%, #16a34a 100%);
      color: #041613;
      box-shadow: 0 6px 20px rgba(34, 197, 94, 0.3),
                  inset 0 1px 0 rgba(255,255,255,0.2);
    }
    .btn--primary:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 10px 28px rgba(34, 197, 94, 0.45),
                  inset 0 1px 0 rgba(255,255,255,0.25);
    }
    .btn--primary:active:not(:disabled) { transform: translateY(0); }
    .btn--primary .material-icons-outlined { color: #041613; }

    .btn--ghost {
      background: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.1);
      color: var(--text);
    }
    .btn--ghost:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .btn--play {
      background: transparent;
      border-color: rgba(255, 255, 255, 0.12);
      color: var(--text);
      padding-left: 10px;
    }
    .btn--play:hover { background: rgba(255,255,255,0.04); }
    .hero__play-icon {
      display: grid; place-items: center;
      width: 32px; height: 32px;
      background: rgba(255,255,255,0.08);
      border-radius: 50%;
      margin-right: 4px;
    }
    .hero__play-icon .material-icons-outlined {
      font-size: 18px; color: var(--text); margin-left: 1px;
    }

    .btn__spin {
      display: inline-block;
      width: 14px; height: 14px;
      border: 2px solid rgba(0, 0, 0, 0.25);
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
       HERO
       ============================================================ */
    .hero {
      position: relative;
      padding: 56px 0 40px;
      overflow: hidden;
    }
    .hero__bg {
      position: absolute; inset: 0;
      background:
        radial-gradient(ellipse 60% 40% at 80% 40%, rgba(34, 197, 94, 0.18) 0%, transparent 60%),
        radial-gradient(ellipse 40% 40% at 20% 80%, rgba(34, 197, 94, 0.1) 0%, transparent 60%);
      pointer-events: none;
    }
    @media (max-width: 720px) { .hero { padding: 24px 0 32px; } }

    .hero__grid {
      position: relative; z-index: 1;
      display: grid;
      grid-template-columns: 1fr 1.3fr;
      gap: 32px;
      align-items: center;
    }
    @media (max-width: 960px) {
      .hero__grid { grid-template-columns: 1fr; gap: 24px; }
      .hero__stage { order: -1; }
    }
    @media (max-width: 720px) {
      .hero__badge { margin-bottom: 14px; padding: 5px 12px; font-size: 11px; }
      .hero__desc { font-size: 15px; margin-bottom: 22px; }
      .hero__ctas { margin-bottom: 22px; }
      .hero__bullets { gap: 14px; }
      .hero__bullets li { font-size: 13px; }
    }

    .hero__badge {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 6px 14px;
      background: var(--brand-soft);
      border: 1px solid var(--border-md);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      color: var(--brand-glow);
      margin-bottom: 24px;
    }
    .hero__badge-dot {
      width: 8px; height: 8px;
      background: var(--brand);
      border-radius: 50%;
      box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.25),
                  0 0 12px var(--brand);
      animation: pulse 1.6s ease-in-out infinite;
    }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }

    .hero__title {
      margin: 0 0 20px;
      font-size: clamp(30px, 5vw, 60px);
      line-height: 1.05;
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--text);
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    @media (max-width: 400px) { .hero__title { font-size: 28px; } }
    .hero__title em {
      font-style: normal;
      color: var(--brand-glow);
      background: linear-gradient(180deg, #4ade80 0%, #22c55e 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .hero__desc {
      margin: 0 0 32px;
      font-size: 17px;
      line-height: 1.6;
      color: var(--text-muted);
      max-width: 540px;
    }

    .hero__ctas {
      display: flex; gap: 12px; flex-wrap: wrap;
      margin-bottom: 32px;
    }

    .hero__bullets {
      display: flex; gap: 24px; flex-wrap: wrap;
      list-style: none; padding: 0; margin: 0;
    }
    .hero__bullets li {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 14px;
      color: var(--text-muted);
    }
    .hero__bullets .material-icons-outlined {
      font-size: 18px;
      color: var(--brand-glow);
      background: var(--brand-soft);
      border-radius: 50%;
      padding: 3px;
      box-sizing: content-box;
    }

    /* ============ Hero stage (TV + boleta) ============ */
    .hero__stage {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 560px;
    }
    @media (max-width: 960px) { .hero__stage { min-height: 380px; } }
    @media (max-width: 480px) { .hero__stage { min-height: 300px; } }

    .stage__product {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      max-width: 780px;
    }
    .stage__product::before {
      content: '';
      position: absolute;
      inset: 5% 5%;
      background: radial-gradient(circle, rgba(34, 197, 94, 0.4) 0%, transparent 60%);
      filter: blur(40px);
      z-index: 0;
      animation: halo-pulse 4s ease-in-out infinite;
    }
    @keyframes halo-pulse {
      0%, 100% { opacity: 0.7; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.08); }
    }
    .stage__product img {
      position: relative;
      z-index: 1;
      max-width: 100%;
      max-height: 560px;
      object-fit: contain;
      filter: drop-shadow(0 40px 50px rgba(0,0,0,0.55))
              drop-shadow(0 0 60px rgba(34, 197, 94, 0.25));
    }
    @media (max-width: 480px) {
      .stage__product img { max-height: 300px; }
    }
    .stage__fallback {
      position: relative;
      z-index: 1;
      font-size: clamp(120px, 15vw, 200px);
      line-height: 1;
      filter: drop-shadow(0 20px 40px rgba(0,0,0,0.5));
    }

    /* Card flotante de boleta — más compacta */
    .ticket-card {
      position: absolute;
      bottom: 4%;
      left: 4%;
      z-index: 3;
      width: min(240px, 68%);
      background: rgba(4, 22, 19, 0.9);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border-md);
      border-radius: var(--r-md);
      padding: 12px 14px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.55),
                  0 0 24px rgba(34, 197, 94, 0.18);
      transform: rotate(-3deg);
      animation: card-float 5s ease-in-out infinite;
    }
    @keyframes card-float {
      0%, 100% { transform: rotate(-3deg) translateY(0); }
      50% { transform: rotate(-3deg) translateY(-5px); }
    }
    .ticket-card__head {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: 10px;
      font-size: 12px;
    }
    .ticket-card__label {
      font-weight: 700;
      color: var(--text);
      font-size: 14px;
      letter-spacing: -0.01em;
      font-variant-numeric: tabular-nums;
    }
    .ticket-card__code {
      color: var(--text-muted);
      font-family: 'JetBrains Mono', 'Menlo', ui-monospace, monospace;
      font-size: 9.5px;
      letter-spacing: 0.06em;
    }
    .ticket-card__grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 4px;
      margin-bottom: 10px;
    }
    .ticket-card__num {
      display: grid; place-items: center;
      padding: 4px 2px;
      background: var(--brand-soft);
      border: 1px solid var(--border-md);
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
      color: var(--brand-glow);
      font-variant-numeric: tabular-nums;
    }
    .ticket-card__foot {
      font-size: 9.5px;
      color: var(--text-muted);
      text-align: center;
      padding-top: 8px;
      border-top: 1px dashed var(--border-md);
    }

    /* ============================================================
       STATSBAR
       ============================================================ */
    .statsbar-wrap { padding: 24px 0; }
    .statsbar {
      display: grid;
      grid-template-columns: repeat(3, auto) 1fr auto;
      gap: 24px;
      align-items: center;
      padding: 20px 24px;
      background: rgba(10, 49, 38, 0.55);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      backdrop-filter: blur(10px);
    }
    @media (max-width: 1080px) {
      .statsbar {
        grid-template-columns: repeat(2, 1fr);
        gap: 20px;
      }
    }
    @media (max-width: 640px) {
      .statsbar {
        grid-template-columns: 1fr 1fr;
        gap: 14px 12px;
        padding: 16px;
      }
      .statsbar__progress {
        grid-column: 1 / -1;
        padding-top: 12px;
        border-top: 1px solid var(--border);
      }
      .statsbar__countdown {
        grid-column: 1 / -1;
        align-items: flex-start;
        padding-top: 12px;
        border-top: 1px solid var(--border);
      }
      .cd-values { gap: 8px; }
      .cd-unit { min-width: 34px; }
      .cd-unit span { font-size: 18px; }
      .cd-unit small { font-size: 9px; letter-spacing: 0.05em; }
      .cd-sep { font-size: 16px; }
      .stat-value { font-size: 20px; }
      .stat-label { font-size: 11px; }
      .stat-icon { width: 38px; height: 38px; }
      .stat-icon .material-icons-outlined { font-size: 20px; }
    }

    .statsbar__stat {
      display: flex; align-items: center; gap: 12px;
    }
    .stat-icon {
      display: grid; place-items: center;
      width: 42px; height: 42px;
      background: var(--brand-soft);
      border: 1px solid var(--border-md);
      border-radius: 12px;
      color: var(--brand-glow);
    }
    .stat-icon .material-icons-outlined { font-size: 22px; }
    .stat-value {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
      color: var(--text);
      line-height: 1;
    }
    .stat-label {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
    }

    .statsbar__progress {
      display: flex; flex-direction: column; gap: 6px;
    }
    .statsbar__progress-pct {
      font-size: 14px;
      font-weight: 600;
      color: var(--text);
    }
    .statsbar__progress-track {
      height: 8px;
      background: rgba(255,255,255,0.06);
      border-radius: 999px;
      overflow: hidden;
    }
    .statsbar__progress-bar {
      height: 100%;
      background: linear-gradient(90deg, #22c55e 0%, #4ade80 100%);
      border-radius: 999px;
      box-shadow: 0 0 12px rgba(34, 197, 94, 0.6);
      transition: width 400ms ease;
    }
    .statsbar__progress-note {
      font-size: 12px;
      color: var(--brand-glow);
      font-weight: 500;
    }

    .statsbar__countdown {
      display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
    }
    .cd-title {
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 500;
    }
    .cd-values {
      display: flex; align-items: baseline; gap: 6px;
    }
    .cd-unit {
      display: flex; flex-direction: column; align-items: center;
      min-width: 40px;
    }
    .cd-unit span {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
      color: var(--text);
      line-height: 1;
    }
    .cd-unit small {
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 4px;
      font-weight: 500;
    }
    .cd-sep {
      color: var(--brand-glow);
      font-size: 20px;
      font-weight: 800;
      align-self: center;
      transform: translateY(-4px);
    }

    /* ============================================================
       SECTIONS
       ============================================================ */
    .section { padding: 64px 0; }
    @media (max-width: 720px) { .section { padding: 48px 0; } }
    .section--how { padding-top: 40px; }
    .section--picker { padding-top: 24px; padding-bottom: 100px; position: relative; }

    .h-section {
      margin: 0 0 8px;
      font-size: clamp(24px, 3vw, 34px);
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.15;
      color: var(--text);
    }
    .section-head { max-width: 640px; margin-bottom: 32px; }
    .section-head-row {
      display: flex; justify-content: space-between; align-items: flex-end;
      gap: 20px; margin-bottom: 28px; flex-wrap: wrap;
    }
    .section-head-row h2 { margin-bottom: 4px; }
    @media (max-width: 720px) {
      .section-head-row { gap: 8px; margin-bottom: 20px; }
      .section-head-row h2 { font-size: 22px; }
      .legend { gap: 4px; }
      .legend__item { padding: 4px 8px; font-size: 10px; }
    }

    .link-arrow {
      display: inline-flex; align-items: center; gap: 6px;
      color: var(--brand-glow);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
    }
    .link-arrow .material-icons-outlined { font-size: 16px; }
    .link-arrow:hover { color: #6ee7b7; }

    /* ============================================================
       PREMIOS
       ============================================================ */
    .prizes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }
    @media (max-width: 720px) {
      .prizes-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }
      .prize-card { padding: 16px; }
      .prize-card__body h3 { font-size: 14px; }
      .prize-card__num { font-size: 11px; }
      .prize-card__ribbon { font-size: 9px; padding: 3px 8px; }
      .prize-card__ribbon .material-icons-outlined { font-size: 11px; }
      .prize-card__emoji { font-size: 42px; }
      .prize-card__media { margin-bottom: 14px; }
      .prize-money__currency { font-size: 16px; margin-top: 4px; }
      .prize-money__amount { font-size: 40px; }
      .prize-money__unit { font-size: 20px; }
      .prize-money__label { font-size: 9px; letter-spacing: 0.18em; }
      .prize-card__tier { font-size: 10px; padding: 2px 7px; }
      .prize-card__date { font-size: 10.5px; }
    }
    .prize-card {
      position: relative;
      background:
        radial-gradient(ellipse at top right, rgba(34, 197, 94, 0.04) 0%, transparent 55%),
        var(--card);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: 22px;
      backdrop-filter: blur(6px);
      transition: transform var(--t-med), border-color var(--t-med),
                  box-shadow var(--t-med);
      overflow: hidden;
    }
    .prize-card::before {
      /* Detalle superior: línea verde fina que crece en hover — nivel Stripe */
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent 0%, var(--brand) 50%, transparent 100%);
      opacity: 0;
      transition: opacity var(--t-med);
    }
    .prize-card:hover {
      transform: translateY(-4px);
      border-color: var(--border-md);
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.32),
                  0 0 0 1px rgba(34, 197, 94, 0.08);
    }
    .prize-card:hover::before { opacity: 0.9; }

    .prize-card--top {
      background:
        radial-gradient(ellipse at top, rgba(34, 197, 94, 0.14) 0%, transparent 55%),
        radial-gradient(ellipse at bottom right, rgba(34, 197, 94, 0.06) 0%, transparent 60%),
        var(--card);
      border-color: rgba(34, 197, 94, 0.35);
      box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.15),
                  0 20px 44px rgba(34, 197, 94, 0.1);
    }
    .prize-card--top::before { opacity: 1; }

    /* Header con # numeración + ribbon premium mayor */
    .prize-card__head {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 16px;
      min-height: 24px;
    }
    .prize-card__num {
      display: inline-flex;
      align-items: baseline;
      gap: 2px;
      font-family: 'JetBrains Mono', 'Menlo', ui-monospace, monospace;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      letter-spacing: 0.02em;
      font-variant-numeric: tabular-nums;
    }
    .prize-card__num-hash { color: var(--text-dim); font-weight: 400; }
    .prize-card--top .prize-card__num { color: var(--brand-glow); }
    .prize-card--top .prize-card__num-hash { color: rgba(34, 197, 94, 0.55); }

    .prize-card__ribbon {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px;
      background: linear-gradient(180deg, rgba(34, 197, 94, 0.22) 0%, rgba(34, 197, 94, 0.12) 100%);
      border: 1px solid rgba(34, 197, 94, 0.35);
      color: var(--brand-glow);
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .prize-card__ribbon .material-icons-outlined { font-size: 12px; }

    /* Media area — display consistente para imagen / dinero / emoji */
    .prize-card__media {
      position: relative;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      aspect-ratio: 5 / 4;
      background:
        radial-gradient(circle at center, rgba(34, 197, 94, 0.08) 0%, transparent 55%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, transparent 100%),
        var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      margin-bottom: 18px;
      overflow: hidden;
    }
    .prize-card__media::after {
      /* Grid sutil de puntos que da textura tecnológica */
      content: '';
      position: absolute; inset: 0;
      background-image: radial-gradient(circle, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
      background-size: 14px 14px;
      pointer-events: none;
      mask-image: radial-gradient(ellipse at center, black 20%, transparent 80%);
      -webkit-mask-image: radial-gradient(ellipse at center, black 20%, transparent 80%);
    }
    .prize-card__media img {
      position: relative; z-index: 1;
      max-width: 88%; max-height: 88%;
      object-fit: contain;
      transition: transform 500ms cubic-bezier(0.4, 0, 0.2, 1);
      filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.3));
    }
    .prize-card:hover .prize-card__media img { transform: scale(1.06); }
    .prize-card__emoji {
      position: relative; z-index: 1;
      font-size: 56px; line-height: 1;
      filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.3));
    }

    /* Display monetario elegante */
    .prize-money {
      position: relative; z-index: 1;
      display: flex;
      align-items: baseline;
      gap: 4px;
      color: var(--text);
      font-family: 'Inter', system-ui, sans-serif;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.03em;
      line-height: 1;
    }
    .prize-money__currency {
      font-size: 22px;
      color: var(--brand-glow);
      font-weight: 500;
      align-self: flex-start;
      margin-top: 6px;
    }
    .prize-money__amount {
      font-size: 54px;
      font-weight: 700;
    }
    .prize-money__unit {
      font-size: 26px;
      color: var(--brand-glow);
      font-weight: 600;
    }
    .prize-money__label {
      position: relative; z-index: 1;
      font-size: 10px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.24em;
      font-weight: 600;
      margin-top: 8px;
    }

    /* Body */
    .prize-card__body h3 {
      margin: 0 0 10px;
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--text);
      line-height: 1.3;
    }
    .prize-card__meta {
      display: flex; align-items: center; gap: 8px;
      flex-wrap: wrap;
    }
    .prize-card__tier {
      display: inline-flex;
      padding: 3px 8px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 500;
    }
    .prize-card--top .prize-card__tier {
      background: var(--brand-soft);
      border-color: rgba(34, 197, 94, 0.25);
      color: var(--brand-glow);
    }
    .prize-card__date {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 11.5px;
      color: var(--text-dim);
      font-weight: 500;
    }
    .prize-card__date .material-icons-outlined { font-size: 13px; }

    /* ============================================================
       ¿CÓMO PARTICIPAR?
       ============================================================ */
    .how-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 24px;
    }
    @media (max-width: 900px) { .how-grid { grid-template-columns: repeat(2, 1fr); gap: 32px 20px; } }
    @media (max-width: 540px) {
      .how-grid { grid-template-columns: repeat(2, 1fr); gap: 24px 12px; }
      .how-step__icon { width: 60px; height: 60px; }
      .how-step__icon .material-icons-outlined { font-size: 26px; }
      .how-step__icon-wrap { margin-bottom: 28px; }
      .how-step h3 { font-size: 14px; }
      .how-step p { font-size: 12px; }
      .how-step__num { font-size: 12px; margin-bottom: 6px; }
    }

    .how-step { text-align: center; position: relative; }
    .how-step__icon-wrap {
      position: relative;
      display: grid; place-items: center;
      margin-bottom: 40px;
    }
    .how-step__icon {
      display: grid; place-items: center;
      width: 76px; height: 76px;
      background: var(--brand-soft);
      border: 2px solid var(--border-md);
      border-radius: 50%;
      color: var(--brand-glow);
      box-shadow: 0 8px 20px rgba(34, 197, 94, 0.15);
      transition: transform var(--t-med), border-color var(--t-med);
    }
    .how-step:hover .how-step__icon {
      transform: translateY(-3px);
      border-color: var(--brand);
    }
    .how-step__icon .material-icons-outlined { font-size: 32px; }
    .how-step__connector {
      position: absolute;
      top: 50%;
      left: calc(50% + 42px);
      width: calc(100% + 24px - 84px);
      height: 2px;
      background: repeating-linear-gradient(
        to right,
        var(--border-md) 0 4px,
        transparent 4px 10px);
    }
    @media (max-width: 900px) { .how-step__connector { display: none; } }
    .how-step__num {
      display: inline-block;
      margin-bottom: 10px;
      font-size: 14px;
      font-weight: 700;
      color: var(--brand-glow);
      letter-spacing: 0.05em;
    }
    .how-step h3 {
      margin: 0 0 6px;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--text);
    }
    .how-step p { margin: 0; font-size: 13px; line-height: 1.55; }

    /* ============================================================
       SELECTOR / GRID de boletas
       ============================================================ */
    .legend {
      display: flex; flex-wrap: wrap; gap: 8px;
    }
    .legend__item {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 10px;
      background: rgba(10, 49, 38, 0.4);
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 500;
    }
    .dot { width: 8px; height: 8px; border-radius: 3px; }
    .dot--free { background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); }
    .dot--sel { background: var(--brand); box-shadow: 0 0 6px var(--brand); }
    .dot--res { background: var(--amber); }
    .dot--sold { background: var(--red); opacity: 0.5; }

    /* Search inline */
    .search {
      display: flex; align-items: center; gap: 8px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      padding: 6px 6px 6px 14px;
      margin-bottom: 20px;
      transition: border-color var(--t-fast), box-shadow var(--t-fast);
      backdrop-filter: blur(6px);
    }
    .search:focus-within {
      border-color: var(--brand);
      box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.14);
    }
    .search__icon { color: var(--text-dim); font-size: 20px; }
    .search__input {
      flex: 1; background: transparent; border: none;
      color: var(--text);
      font-size: 15px;
      padding: 10px 4px;
      outline: none;
      font-family: inherit;
      font-variant-numeric: tabular-nums;
      -webkit-appearance: none; appearance: none; -moz-appearance: textfield;
    }
    .search__input::-webkit-outer-spin-button,
    .search__input::-webkit-inner-spin-button {
      -webkit-appearance: none; margin: 0;
    }
    .search__input::placeholder { color: var(--text-dim); }
    .search__hint {
      margin: 4px 4px 16px;
      font-size: 12.5px;
      line-height: 1.5;
    }

    .search-result {
      display: flex; align-items: flex-start; gap: 14px;
      padding: 16px 18px; margin-bottom: 20px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      position: relative;
    }
    .search-result[data-status="available"] { border-color: rgba(34, 197, 94, 0.4); }
    .search-result[data-status="available"] .search-result__icon { color: var(--brand-glow); }
    .search-result[data-status="sold"] { border-color: rgba(239, 68, 68, 0.4); }
    .search-result[data-status="sold"] .search-result__icon { color: var(--red); }
    .search-result[data-status="reserved"] { border-color: rgba(245, 158, 11, 0.4); }
    .search-result[data-status="reserved"] .search-result__icon { color: var(--amber); }
    .search-result[data-status="assigned"] { border-color: rgba(59, 130, 246, 0.4); }
    .search-result[data-status="assigned"] .search-result__icon { color: var(--blue); }
    .search-result__icon { font-size: 22px; margin-top: 2px; flex-shrink: 0; }
    .search-result__body { flex: 1; min-width: 0; }
    .search-result__body strong { display: block; font-size: 14px; margin-bottom: 4px; }
    .search-result__body p { margin: 0; font-size: 13px; color: var(--text-muted); }
    .search-result__actions { display: flex; gap: 8px; flex-shrink: 0; }
    .search-result__close {
      background: transparent; border: none;
      color: var(--text-dim); cursor: pointer;
      padding: 4px; border-radius: 6px;
      display: grid; place-items: center;
    }
    .search-result__close:hover { color: var(--text); background: rgba(255,255,255,0.06); }
    .search-result__close .material-icons-outlined { font-size: 18px; }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
      gap: 8px;
    }
    @media (max-width: 720px) {
      .grid { grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: 6px; }
      .ticket { padding: 12px 4px; font-size: 13px; border-radius: 10px; }
      .ticket__check { width: 14px; height: 14px; font-size: 11px; top: 4px; right: 4px; }
    }
    .grid--skeleton { pointer-events: none; }

    .ticket {
      position: relative;
      display: flex; align-items: center; justify-content: center;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      padding: 16px 8px;
      font-family: inherit;
      color: var(--text);
      font-weight: 600; font-size: 15px;
      font-variant-numeric: tabular-nums;
      cursor: pointer;
      transition: transform var(--t-fast), background var(--t-fast),
                  border-color var(--t-fast), box-shadow var(--t-fast);
      overflow: hidden;
      backdrop-filter: blur(4px);
    }
    .ticket__number { position: relative; z-index: 1; }
    .ticket__check {
      position: absolute; top: 6px; right: 6px;
      color: #041613;
      font-size: 14px;
      background: var(--brand);
      border-radius: 50%;
      width: 18px; height: 18px;
      display: grid; place-items: center;
      z-index: 2;
    }
    .ticket--available:hover {
      background: rgba(34, 197, 94, 0.08);
      border-color: var(--border-str);
      transform: translateY(-1px);
    }
    .ticket--selected {
      background: linear-gradient(180deg, rgba(34, 197, 94, 0.22) 0%, rgba(34, 197, 94, 0.1) 100%);
      border-color: var(--brand);
      color: var(--text);
      box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.14);
    }
    .ticket--selected:hover { background: rgba(34, 197, 94, 0.28); }
    .ticket--pulse { animation: ticket-pulse 1.4s ease-in-out 2; }
    @keyframes ticket-pulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.14); }
      50% { transform: scale(1.06); box-shadow: 0 0 0 8px rgba(34, 197, 94, 0.22); }
    }
    .ticket--skeleton {
      background: linear-gradient(90deg, var(--surface) 0%, var(--surface-2) 50%, var(--surface) 100%);
      background-size: 200% 100%;
      animation: skel 1.4s linear infinite;
      height: 54px;
      cursor: default;
    }
    @keyframes skel { to { background-position: -200% 0; } }

    .empty {
      text-align: center; padding: 80px 20px;
      background: var(--card); border: 1px solid var(--border);
      border-radius: var(--r-lg);
    }
    .empty__icon { font-size: 44px; color: var(--text-dim); margin-bottom: 12px; display: block; }
    .empty h3 { margin: 0 0 6px; font-size: 17px; font-weight: 600; }
    .empty p { margin: 0; font-size: 14px; }

    /* Bottom bar sticky con selección */
    .picker__bar {
      position: sticky; bottom: 16px; z-index: 30;
      margin-top: 32px; padding: 0 24px;
    }
    .picker__bar-inner {
      display: flex; align-items: center; justify-content: space-between;
      gap: 20px;
      padding: 16px 20px;
      background: rgba(8, 40, 32, 0.88);
      backdrop-filter: saturate(180%) blur(20px);
      -webkit-backdrop-filter: saturate(180%) blur(20px);
      border: 1px solid var(--border-str);
      border-radius: var(--r-lg);
      box-shadow: var(--shadow-lg);
    }
    .picker__bar-info { display: flex; flex-direction: column; gap: 2px; }
    .picker__bar-count { font-size: 13px; color: var(--text-muted); font-weight: 500; }
    .picker__bar-total { font-size: 17px; font-weight: 600; }
    .picker__bar-total strong { color: var(--brand-glow); font-weight: 800; }
    @media (max-width: 720px) {
      .picker__bar { bottom: 12px; padding: 0 12px; }
      .picker__bar-inner { padding: 12px 14px; gap: 10px; }
      .picker__bar-count { font-size: 11px; }
      .picker__bar-total { font-size: 14px; }
      .picker__bar-inner .btn { padding: 10px 14px; font-size: 13px; }
      .picker__bar-inner .btn .material-icons-outlined { font-size: 16px; }
    }

    /* ============================================================
       FEATURES
       ============================================================ */
    .features-wrap { padding: 40px 0 20px; }
    .features {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
      padding: 24px;
      background: rgba(10, 49, 38, 0.4);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      backdrop-filter: blur(6px);
    }
    @media (max-width: 900px) { .features { grid-template-columns: repeat(2, 1fr); gap: 16px; padding: 20px; } }
    @media (max-width: 480px) {
      .features { grid-template-columns: 1fr; gap: 14px; padding: 16px; }
      .feature__icon { width: 40px; height: 40px; }
      .feature__icon .material-icons-outlined { font-size: 20px; }
      .feature h3 { font-size: 13px; }
      .feature p { font-size: 12px; }
    }
    .feature {
      display: flex; gap: 14px; align-items: flex-start;
    }
    .feature__icon {
      display: grid; place-items: center;
      width: 44px; height: 44px;
      background: var(--brand-soft);
      border: 1px solid var(--border-md);
      border-radius: 50%;
      color: var(--brand-glow);
      flex-shrink: 0;
    }
    .feature__icon .material-icons-outlined { font-size: 22px; }
    .feature h3 { margin: 0 0 4px; font-size: 14px; font-weight: 700; }
    .feature p { margin: 0; font-size: 12.5px; line-height: 1.5; }

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
      backdrop-filter: blur(6px);
    }
    .faq__item:hover, .faq__item[open] { border-color: var(--border-md); }
    .faq__q {
      display: flex; justify-content: space-between; align-items: center;
      padding: 18px 22px;
      gap: 12px;
      cursor: pointer;
      font-size: 15px;
      font-weight: 500;
      list-style: none;
      user-select: none;
      color: var(--text);
    }
    .faq__q::-webkit-details-marker { display: none; }
    @media (max-width: 720px) {
      .faq__q { padding: 16px 18px; font-size: 14px; }
      .faq__a { padding: 0 18px 16px; font-size: 13.5px; }
    }
    .faq__chev {
      font-size: 20px;
      color: var(--text-muted);
      transition: transform var(--t-med), color var(--t-med);
    }
    .faq__item[open] .faq__chev { transform: rotate(180deg); color: var(--brand-glow); }
    .faq__a {
      padding: 0 22px 20px;
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
      padding: 32px 0;
      border-top: 1px solid var(--border);
    }
    .foot__inner {
      display: flex; justify-content: space-between; align-items: center;
      gap: 14px; flex-wrap: wrap;
      font-size: 13px; color: var(--text-muted);
    }
    .foot__brand {
      display: inline-flex; align-items: center; gap: 8px;
      color: var(--text); font-weight: 700;
    }
    .foot__meta { display: inline-flex; gap: 8px; flex-wrap: wrap; }
    .foot__sep { color: var(--text-dim); }

    /* ============================================================
       WhatsApp FAB
       ============================================================ */
    .whatsapp-fab {
      position: fixed;
      bottom: 20px; right: 20px;
      z-index: 50;
      display: grid; place-items: center;
      width: 56px; height: 56px;
      background: #25d366;
      color: #fff;
      border-radius: 50%;
      text-decoration: none;
      box-shadow: 0 12px 24px rgba(37, 211, 102, 0.4),
                  0 0 0 3px rgba(255,255,255,0.06);
      transition: transform var(--t-fast), box-shadow var(--t-fast);
    }
    .whatsapp-fab:hover {
      transform: translateY(-2px) scale(1.05);
      box-shadow: 0 16px 32px rgba(37, 211, 102, 0.55);
    }
    @media (max-width: 720px) {
      .whatsapp-fab { width: 48px; height: 48px; bottom: 16px; right: 16px; }
      .whatsapp-fab svg { width: 24px; height: 24px; }
    }

    /* ============================================================
       PILLS + FORMS + MODALES
       ============================================================ */
    .pill {
      display: inline-flex; align-items: center;
      padding: 4px 10px;
      background: var(--brand-soft);
      color: var(--brand-glow);
      border: 1px solid var(--border-md);
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .form { display: flex; flex-direction: column; gap: 16px; margin-top: 24px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field__label { font-size: 12px; font-weight: 600; color: var(--text-muted); letter-spacing: 0.02em; }
    .field__label small { font-size: 11px; color: var(--text-dim); font-weight: 500; margin-left: 4px; }
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
      border-color: var(--brand);
      box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.14);
    }
    .input:-webkit-autofill,
    .input:-webkit-autofill:hover,
    .input:-webkit-autofill:focus {
      -webkit-box-shadow: 0 0 0 40px var(--surface) inset !important;
      -webkit-text-fill-color: var(--text) !important;
      caret-color: var(--text);
    }

    .or {
      display: flex; align-items: center; gap: 12px;
      margin: 4px 0;
      color: var(--text-dim);
      font-size: 12px;
    }
    .or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--border); }

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

    .modal {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      z-index: 100;
      animation: fadeIn 200ms ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .modal__card {
      background: var(--surface-2);
      border: 1px solid var(--border-md);
      border-radius: var(--r-xl);
      padding: 28px;
      max-width: 480px; width: 100%;
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
      gap: 16px; margin-bottom: 20px;
    }
    .modal__head h2 { margin: 8px 0 4px; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
    .modal__head p { margin: 0; font-size: 13px; }
    .modal__actions {
      display: flex; flex-direction: column; gap: 10px;
      margin-top: 20px; padding-top: 20px;
      border-top: 1px solid var(--border);
    }
    .preview-ticket {
      display: flex; justify-content: center;
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

  countdown = signal<{ days: string; hours: string; minutes: string; seconds: string } | null>(null);
  private countdownInterval: ReturnType<typeof setInterval> | null = null;

  skeletonRange = Array.from({ length: 30 }, (_, i) => i);

  faq = [
    {
      q: '¿Y si soy el afortunado, cómo me entero?',
      a: 'Muy fácil. En el momento en que se juegue el sorteo, te enviamos un mensaje al correo y por WhatsApp con tu boleta ganadora. Además, publicamos el ganador con evidencia en nuestras redes. Tu boleta tiene un QR que puedes escanear en cualquier momento para verificar el estado.',
    },
    {
      q: '¿Cómo puedo estar seguro de que esto no es una estafa?',
      a: 'La rifa se juega con la lotería oficial que ves publicada, no somos nosotros los que definimos los números ganadores. Cada boleta tiene un código único registrado antes del sorteo, verificable públicamente por cualquiera. Todo el proceso queda trazable — nada sale de la plataforma sin quedar registrado.',
    },
    {
      q: '¿Qué formas de pago aceptan?',
      a: 'Pagas al instante con Nequi, PSE, Bancolombia o tarjeta débito/crédito a través de Wompi (100% seguro). Si prefieres, también puedes hacer transferencia manual y subir el comprobante — el organizador lo aprueba en menos de 24 horas.',
    },
    {
      q: 'Reservé una boleta pero aún no he pagado. ¿Qué pasa?',
      a: 'Tranquilo, tu boleta queda reservada solo para ti durante 24 horas. Antes de que se venza recibes un recordatorio por WhatsApp. Si no alcanzas a pagar, la boleta vuelve a estar disponible y puedes intentar de nuevo con otra.',
    },
    {
      q: '¿Puedo comprar varias boletas de una?',
      a: '¡Claro! Puedes seleccionar hasta 10 boletas por compra y todas quedan a nombre tuyo con un solo pago. Si quieres más de 10, simplemente haces otra compra — sin límite total.',
    },
    {
      q: '¿Qué pasa con mis datos personales?',
      a: 'Solo te pedimos cédula, nombre, email y celular — la información mínima que necesitamos para entregarte el premio si ganas. No los compartimos con nadie, ni los usamos para spam ni publicidad. Todo cifrado, todo privado.',
    },
    {
      q: '¿Y si tengo un problema o quiero cancelar?',
      a: 'Estamos a un WhatsApp de distancia. Toca el botón verde flotante y te respondemos rápido. Si tu boleta aún no ha sido pagada, puedes soltarla sin problema. Si ya pagaste, revisamos tu caso.',
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
    return this.available().filter((t) => set.has(t.id))
      .map((t) => t.number_label).join(', ');
  });

  availableCount = computed(() => this.available().length);
  soldCount = computed(() => {
    const r = this.overview();
    if (!r) return 0;
    return Math.round((r.total_tickets * r.sold_pct) / 100);
  });

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

  /** Divide el nombre de la rifa por " + " para pintar la parte después del +
   *  en verde brillante. Ejemplo: "Televisor de 50" + 3 bonos de 200k" →
   *  { left: 'Televisor de 50"', right: '3 bonos de 200k' } que renderiza
   *  como "Televisor de 50" <em>+ 3 bonos de 200k</em>". */
  heroTitleParts = computed<{ left: string; right: string } | null>(() => {
    const r = this.overview();
    if (!r) return null;
    const name = r.name || '';
    const idx = name.indexOf(' + ');
    if (idx === -1) return { left: name, right: '' };
    return {
      left: name.slice(0, idx + 1),      // "Televisor de 50" "
      right: '+ ' + name.slice(idx + 3), // "+ 3 bonos de 200k"
    };
  });

  /** Un ticket de muestra para la card flotante del hero. Toma el primer
   *  ticket disponible del pool si existe; si no, genera uno decorativo. */
  sampleTicket = computed(() => {
    const first = this.available()[0];
    if (first) {
      return {
        label: first.number_label,
        code: first.code,
        numbers: this.generateSampleNumbers(first.id),
      };
    }
    return {
      label: '042',
      code: 'NF5-Q8F-MBY',
      numbers: ['0421', '1837', '2604', '3719', '4250', '5183', '6042', '7271', '8540', '9617'],
    };
  });

  private generateSampleNumbers(seed: number): string[] {
    const nums: string[] = [];
    let s = seed;
    for (let i = 0; i < 10; i++) {
      s = (s * 9301 + 49297) % 233280;
      const v = Math.floor((s / 233280) * 10000);
      nums.push(String(v).padStart(4, '0'));
    }
    return nums;
  }

  previewTicket = computed(() => {
    const pd = this.previewData();
    if (!pd) return null;
    return {
      id: 0, raffle_id: pd.raffle.id,
      number_label: pd.ticket.label,
      code: pd.ticket.code,
      status: 'available' as const,
      seller_id: null, customer_id: null,
      numbers: pd.ticket.numbers.map((n, idx) => ({ number: n, position: idx })),
    };
  });

  previewPrizes = computed(() => {
    const pd = this.previewData();
    if (!pd) return [];
    return pd.prizes.map((p, idx) => ({
      position: idx + 1, name: p.name,
      draw_date: p.draw_date, winning_number: p.winning_number,
    }));
  });

  whatsappHref = computed(() => {
    const r = this.overview();
    const phone = r?.lottery_name ? '573135487605' : '573135487605';
    const raffleName = r?.name ?? 'la rifa';
    const msg = `Hola, quiero saber más sobre la rifa "${raffleName}".`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  });

  /**
   * Detecta si el nombre del premio es un monto monetario ("bono 200K",
   * "efectivo 500.000", etc) y lo divide en value/unit para mostrarlo con
   * tipografía tabular en un display "$ 200 K" en el card, en lugar del
   * emoji genérico de billete. Devuelve null si no es monetario.
   */
  prizeAmount(name: string): { value: string; unit: string } | null {
    const n = (name || '').toLowerCase();
    if (!/(bono|efectivo|dinero|plata|cash|premio en)/.test(n)) return null;
    // Casos comunes: "200K", "200k", "1M", "500.000", "500000"
    const kMatch = n.match(/(\d+(?:[.,]\d+)?)\s*k\b/);
    if (kMatch) return { value: kMatch[1].replace(',', '.'), unit: 'K' };
    const mMatch = n.match(/(\d+(?:[.,]\d+)?)\s*m\b/);
    if (mMatch) return { value: mMatch[1].replace(',', '.'), unit: 'M' };
    const raw = n.match(/(\d[\d.,]*)/);
    if (raw) {
      const digits = raw[1].replace(/[.,]/g, '');
      const num = parseInt(digits, 10);
      if (isNaN(num)) return null;
      if (num >= 1_000_000) return { value: String(num / 1_000_000), unit: 'M' };
      if (num >= 1_000) return { value: String(num / 1_000), unit: 'K' };
      return { value: String(num), unit: '' };
    }
    return null;
  }

  prizeEmoji(name: string): string {
    const n = (name || '').toLowerCase();
    if (!n) return '🏆';
    if (/(televisor|tele\b|\btv\b|pantalla|smart tv)/.test(n)) return '📺';
    if (/(moto|scooter|motocicleta)/.test(n)) return '🏍️';
    if (/(carro|auto\b|vehículo|camioneta)/.test(n)) return '🚗';
    if (/(celular|iphone|samsung|smartphone|teléfono)/.test(n)) return '📱';
    if (/(nevera|refrigerador)/.test(n)) return '🧊';
    if (/(lavadora)/.test(n)) return '🧺';
    if (/(bono|efectivo|dinero|plata|cash)/.test(n)) return '💵';
    if (/(portátil|computador|laptop|pc\b|notebook)/.test(n)) return '💻';
    if (/(bicicleta|bici)/.test(n)) return '🚴';
    if (/(mercado|canasta)/.test(n)) return '🛒';
    if (/(consola|ps5|xbox|nintendo)/.test(n)) return '🎮';
    if (/(reloj|smartwatch|airpods|audífonos)/.test(n)) return '⌚';
    if (/(cámara|camara)/.test(n)) return '📷';
    return '🎁';
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) {
      this.error.set('URL inválida');
      this.loading.set(false);
      return;
    }
    this.raffleId = id;

    const ref = this.route.snapshot.queryParamMap.get('ref');
    if (ref) { try { localStorage.setItem('boletera_referral_code', ref); } catch {} }

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
    // Mostrar countdown siempre que haya fecha final. La fecha proviene de la
    // rifa (r.final_draw_date), independiente del threshold — el cliente
    // quiere ver "cuánto falta" desde el inicio para generar urgencia.
    if (!r.final_draw_date) return;
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
      this.countdown.set({
        days: String(Math.floor(diff / 86400000)).padStart(2, '0'),
        hours: String(Math.floor((diff % 86400000) / 3600000)).padStart(2, '0'),
        minutes: String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0'),
        seconds: String(Math.floor((diff % 60000) / 1000)).padStart(2, '0'),
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
          status: 'not_found', number_label: '', matched_number: q,
          ticket_id: null,
          message: 'No pudimos buscar ese número. Intenta de nuevo.',
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

  scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  formatDateShort(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    if (isNaN(d.getTime())) return iso;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
}
