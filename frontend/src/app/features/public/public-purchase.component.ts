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
  PublicTicketDetail,
  TicketLookup,
} from '@core/services/public-sales.service';
import { ThemeService } from '@core/services/theme.service';
import { TicketDesignComponent } from '@shared/components/ticket-design/ticket-design.component';

/**
 * Portal PÚBLICO de compra online de boletas — v3 premium.
 *
 * Estructura visual (storytelling):
 *   1. Hero full-bleed con TV protagonista (imagen grande + halo + partículas)
 *   2. Grid de premios como cards prominentes
 *   3. Cómo funciona (3 pasos visuales)
 *   4. Buscador por número
 *   5. Grid de boletas con preview modal (ver diseño real antes de reservar)
 *   6. Footer con marca
 *
 * Flujo compra:
 *   - Cliente explora sin compromiso (click en boleta → preview del diseño)
 *   - Desde el preview: "Reservar y pagar" pre-selecciona esa boleta y abre checkout
 *   - O selecciona varias en el grid → "Continuar al pago" → modal formulario
 *   - Wompi (si configurado) o transferencia manual (comprobante)
 */
@Component({
  selector: 'app-public-purchase',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TicketDesignComponent],
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

        <!-- Toggle claro/oscuro flotante -->
        <button class="theme-toggle" type="button"
                (click)="theme.toggle()"
                [attr.aria-label]="theme.isDark() ? 'Modo claro' : 'Modo oscuro'"
                [title]="theme.isDark() ? 'Modo claro' : 'Modo oscuro'">
          <span class="material-icons">{{ theme.isDark() ? 'light_mode' : 'dark_mode' }}</span>
        </button>

        <!-- ============ HERO FULL-BLEED ============ -->
        <section class="hero">
          <div class="hero__bg">
            <div class="hero__mesh"></div>
            <div class="hero__spotlight"></div>
            <div class="hero__stars">
              @for (i of [1,2,3,4,5,6,7,8,9,10,11,12]; track i) {
                <span></span>
              }
            </div>
          </div>

          <div class="hero__inner">
            <div class="hero__text">
              <div class="badge">
                <span class="badge__dot"></span>
                <span>Rifa activa</span>
                @if (r.prizes.length) {
                  <span class="badge__sep">·</span>
                  <span>{{ r.prizes.length }} premios</span>
                }
              </div>

              <h1 class="hero__title">{{ r.name }}</h1>

              @if (r.description) {
                <p class="hero__desc">{{ r.description }}</p>
              }

              @if (r.public_welcome_message) {
                <div class="welcome">
                  <span class="material-icons">campaign</span>
                  <p>{{ r.public_welcome_message }}</p>
                </div>
              }

              <div class="hero__stats">
                <div class="stat">
                  <strong>\${{ formatNumber(r.ticket_price) }}</strong>
                  <small>por boleta</small>
                </div>
                <div class="stat">
                  <strong>{{ r.sold_pct }}%</strong>
                  <small>vendido</small>
                </div>
                @if (r.show_draw_date && r.final_draw_date) {
                  <div class="stat">
                    <strong>{{ formatDate(r.final_draw_date) }}</strong>
                    <small>sorteo final</small>
                  </div>
                }
              </div>

              <div class="progress">
                <div class="progress__bar" [style.width.%]="r.sold_pct"></div>
              </div>

              <div class="hero__ctas">
                <button class="btn primary btn--xl" (click)="scrollToGrid()">
                  <span class="material-icons">grid_on</span>
                  Elige tu boleta
                </button>
                <button class="btn ghost-light btn--xl" (click)="scrollToSearch()">
                  <span class="material-icons">search</span>
                  Buscar número
                </button>
              </div>
            </div>

            <div class="hero__stage">
              <div class="stage__halo"></div>
              <div class="stage__floor"></div>
              <div class="stage__frame">
                @if (r.logo_url) {
                  <img [src]="r.logo_url" [alt]="topPrizeName()" class="stage__img" />
                } @else {
                  <div class="stage__fallback">{{ heroPrizeEmoji() }}</div>
                }
              </div>
              <div class="stage__ribbon">
                <span class="material-icons">emoji_events</span>
                <span>{{ topPrizeName() }}</span>
              </div>
              <div class="stage__sparkle stage__sparkle--1">✨</div>
              <div class="stage__sparkle stage__sparkle--2">✨</div>
              <div class="stage__sparkle stage__sparkle--3">⭐</div>
            </div>
          </div>

          <div class="hero__scroll">
            <span class="material-icons">expand_more</span>
          </div>
        </section>

        <!-- ============ BUSCADOR compacto + GRID (justo debajo del hero) ============ -->
        <section class="picker" #gridSection id="grid-section">
          <div class="picker__head">
            <div class="picker__title">
              <span class="section-tag">🎟️ Todas las boletas</span>
              <h2>Elige tu boleta favorita</h2>
              <p class="muted">Haz clic en una boleta para ver su diseño antes de reservar.</p>
            </div>
            <div class="picker__legend">
              <span class="chip chip--free">Disponible</span>
              <span class="chip chip--sel">Seleccionada</span>
            </div>
          </div>

          <!-- Buscador inline: chip elegante integrado al picker -->
          <div class="quick-search" id="search-section">
            <div class="quick-search__label">
              <span class="material-icons">search</span>
              <span>Buscar número</span>
            </div>
            <form class="quick-search__form" (ngSubmit)="doSearch()">
              <input type="number" class="quick-search__input"
                     [(ngModel)]="searchInput" name="searchInput"
                     [placeholder]="'Ej: ' + searchPlaceholder()"
                     [min]="1" inputmode="numeric" />
              <button type="submit" class="btn primary" [disabled]="searching()">
                @if (searching()) {
                  <span class="btn__spin"></span>
                } @else {
                  <span class="material-icons">search</span>
                }
                Buscar
              </button>
            </form>

            @if (searchResult(); as sr) {
              <div class="search-result search-result--{{ sr.status }}">
                <span class="material-icons">
                  {{ sr.status === 'available' ? 'check_circle'
                   : sr.status === 'sold' ? 'block'
                   : sr.status === 'reserved' ? 'lock_clock'
                   : sr.status === 'assigned' ? 'person_search'
                   : 'help_outline' }}
                </span>
                <div class="search-result__body">
                  <strong>Boleta {{ sr.number_label }}</strong>
                  <p>{{ sr.message }}</p>
                  @if (sr.status === 'available' && sr.ticket_id) {
                    <div class="search-result__actions">
                      <button type="button" class="btn primary btn--sm"
                              (click)="openTicketPreviewById(sr.ticket_id!)">
                        <span class="material-icons">visibility</span>
                        Ver la boleta
                      </button>
                      <button type="button" class="btn ghost btn--sm"
                              (click)="selectFromSearch(sr.ticket_id!)">
                        <span class="material-icons">add_shopping_cart</span>
                        Reservar directo
                      </button>
                    </div>
                  }
                </div>
                <button class="search-result__close" (click)="clearSearch()"
                        aria-label="Cerrar">×</button>
              </div>
            }
          </div>

          @if (loadingTickets()) {
            <div class="grid-skeleton">
              @for (i of [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]; track i) {
                <div class="skeleton-cell"></div>
              }
            </div>
          } @else if (!available().length) {
            <div class="empty">
              <span class="material-icons big">confirmation_number</span>
              <p><strong>No hay boletas disponibles públicamente.</strong></p>
              <p class="muted">Puede que todas estén asignadas a vendedores o ya se hayan vendido.</p>
            </div>
          } @else {
            <div class="grid">
              @for (t of available(); track t.id) {
                <button type="button"
                        [id]="'ticket-' + t.id"
                        class="cell"
                        [class.cell--selected]="isSelected(t.id)"
                        [class.cell--pulse]="pulseTicketId() === t.id"
                        (click)="openTicketPreview(t)">
                  {{ t.number_label }}
                </button>
              }
            </div>
          }

          @if (selected().size > 0) {
            <div class="summary">
              <div class="summary__info">
                <strong>{{ selected().size }}</strong> boleta(s) seleccionada(s)
                — total <strong>\${{ formatNumber(totalPrice()) }}</strong>
              </div>
              <button class="btn primary btn--lg" (click)="openCheckout()">
                Continuar al pago
                <span class="material-icons">arrow_forward</span>
              </button>
            </div>
          }
        </section>

        <!-- ============ GRID DE PREMIOS (rediseñado — mosaico premium) ============ -->
        @if (r.prizes.length) {
          <section class="prizes-showcase">
            <div class="section-head">
              <span class="section-tag">🏆 Los premios en juego</span>
              <h2>Todos los premios que puedes ganar</h2>
              <p>Cada boleta juega por múltiples premios en fechas distintas.</p>
            </div>

            <div class="prizes-mosaic">
              @for (p of r.prizes; track p.position; let idx = $index) {
                <article class="prize-tile" [class.prize-tile--top]="idx === 0">
                  <div class="prize-tile__index">{{ (idx + 1) < 10 ? '0' : '' }}{{ idx + 1 }}</div>
                  <div class="prize-tile__icon">
                    <span>{{ prizeEmoji(p.name) }}</span>
                  </div>
                  <div class="prize-tile__body">
                    <div class="prize-tile__tag">
                      {{ idx === 0 ? '★ Premio mayor' : 'Premio ' + (idx + 1) }}
                    </div>
                    <h3>{{ p.name }}</h3>
                    @if (p.draw_date) {
                      <div class="prize-tile__date">
                        <span class="material-icons">event</span>
                        {{ formatDate(p.draw_date) }}
                      </div>
                    }
                  </div>
                </article>
              }
            </div>
          </section>
        }

        <!-- ============ CÓMO FUNCIONA — pasos con connector ============ -->
        <section class="steps">
          <div class="section-head">
            <span class="section-tag">✨ Simple en 3 pasos</span>
            <h2>Comprar tu boleta es muy fácil</h2>
          </div>
          <div class="steps__flow">
            <div class="step-item">
              <div class="step-item__badge">
                <span class="step-item__num">01</span>
                <span class="material-icons">confirmation_number</span>
              </div>
              <h3>Elige tu boleta</h3>
              <p>Explora las boletas disponibles y ve el diseño real antes de reservar.</p>
            </div>
            <div class="steps__connector" aria-hidden="true">
              <svg viewBox="0 0 60 24" width="60" height="24"><path d="M0 12 L52 12 M46 5 L54 12 L46 19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="step-item">
              <div class="step-item__badge">
                <span class="step-item__num">02</span>
                <span class="material-icons">payments</span>
              </div>
              <h3>Paga en línea</h3>
              <p>Nequi, PSE, tarjeta o transferencia con comprobante. Tu boleta queda reservada 24 horas.</p>
            </div>
            <div class="steps__connector" aria-hidden="true">
              <svg viewBox="0 0 60 24" width="60" height="24"><path d="M0 12 L52 12 M46 5 L54 12 L46 19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="step-item">
              <div class="step-item__badge">
                <span class="step-item__num">03</span>
                <span class="material-icons">emoji_events</span>
              </div>
              <h3>Gana premios</h3>
              <p>Te notificamos por correo y WhatsApp cuando se sortee. Verificación pública instantánea.</p>
            </div>
          </div>
        </section>

        <!-- FOOTER premium -->
        <footer class="foot">
          <div class="foot__brand">
            <span class="foot__dot"></span>
            <span>Boletera</span>
          </div>
          <p>Compra segura · Verificación pública de tus boletas · Sorteo con Lotería.</p>
          @if (r.lottery_name) {
            <p class="foot__lot">Juega con: <strong>{{ r.lottery_name }}</strong></p>
          }
        </footer>

      }

      <!-- ============ MODAL PREVIEW DE BOLETA ============ -->
      @if (previewOpen() && previewData(); as pd) {
        <div class="modal modal--preview" (click)="closePreview()">
          <div class="modal__card modal__card--wide" (click)="$event.stopPropagation()">
            <button class="modal__close" (click)="closePreview()" aria-label="Cerrar">×</button>
            <div class="preview-head">
              <h2>Boleta {{ pd.ticket.label }}</h2>
              <p>Este es el diseño exacto que recibirás. Los 20 números son únicos para esta boleta.</p>
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

            <div class="preview-actions">
              @if (isSelected(previewTicketId()!)) {
                <button class="btn ghost btn--lg" (click)="removeFromSelection(previewTicketId()!)">
                  <span class="material-icons">remove_shopping_cart</span>
                  Quitar de la selección
                </button>
              } @else {
                <button class="btn primary btn--lg" (click)="selectAndClosePreview()">
                  <span class="material-icons">add_shopping_cart</span>
                  Reservar esta boleta
                </button>
              }
              <button class="btn ghost btn--lg" (click)="reserveAndCheckoutNow()">
                <span class="material-icons">bolt</span>
                Reservar y pagar ya
              </button>
            </div>
          </div>
        </div>
      }

      <!-- MODAL CHECKOUT (formulario cliente) -->
      @if (checkoutOpen()) {
        <div class="modal" (click)="closeCheckout()">
          <div class="modal__card" (click)="$event.stopPropagation()">
            <button class="modal__close" (click)="closeCheckout()" aria-label="Cerrar">×</button>
            <h2>Completar tu compra</h2>
            <p class="modal__lead">
              Boletas: <strong>{{ selectedLabels() }}</strong>
              — total <strong>\${{ formatNumber(totalPrice()) }}</strong>
            </p>

            <form class="form" (ngSubmit)="submit()" autocomplete="on">
              <label class="field">
                <span>Cédula</span>
                <input type="text" [(ngModel)]="form.customer_document" name="doc"
                       required minlength="4" maxlength="30" inputmode="numeric"
                       autocomplete="off" placeholder="Tu número de cédula" />
              </label>

              <label class="field">
                <span>Nombre completo</span>
                <input type="text" [(ngModel)]="form.customer_name" name="name"
                       required minlength="2" maxlength="150"
                       autocomplete="name" placeholder="Nombre y apellidos" />
              </label>

              <label class="field">
                <span>Email</span>
                <input type="email" [(ngModel)]="form.customer_email" name="email" required
                       autocomplete="email" placeholder="tucorreo@ejemplo.com" />
              </label>

              <label class="field">
                <span>Celular (WhatsApp)</span>
                <input type="tel" [(ngModel)]="form.customer_phone" name="phone"
                       required minlength="7"
                       autocomplete="tel" placeholder="3001234567" />
              </label>

              <label class="field">
                <span>Ciudad (opcional)</span>
                <input type="text" [(ngModel)]="form.customer_city" name="city" maxlength="80"
                       autocomplete="address-level2" placeholder="Ej: Valledupar" />
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
                <button type="button" class="btn ghost btn--lg" (click)="switchManual()">
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
    /* ============ TEMA CLARO (default) ============ */
    :host {
      display: block;
      min-height: 100vh;
      font-family: 'Inter', system-ui, sans-serif;

      --pg-bg:
        radial-gradient(ellipse at 20% 0%, rgba(201, 169, 110, 0.18), transparent 45%),
        radial-gradient(ellipse at 80% 100%, rgba(30, 199, 123, 0.12), transparent 50%),
        linear-gradient(180deg, #faf6ee 0%, #f0e5c8 100%);
      --pg-text: #1a2942;
      --pg-muted: #6b7280;
      --heading: #1a2942;

      --card-bg: #ffffff;
      --card-border: rgba(201, 169, 110, 0.15);
      --card-shadow: 0 4px 24px rgba(26, 41, 66, 0.08);

      --input-bg: #ffffff;
      --input-text: #1a2942;
      --input-border: rgba(26, 41, 66, 0.15);
      --input-placeholder: #9ca3af;

      --cell-bg: linear-gradient(180deg, #fff 0%, #f8f1e3 100%);
      --cell-bg-hover: #ffffff;
      --cell-text: #1a2942;
      --cell-border: rgba(26, 41, 66, 0.12);

      --summary-bg: linear-gradient(90deg, #f8f1e3 0%, #f0e5c8 100%);
      --summary-border: rgba(201, 169, 110, 0.3);

      --toggle-bg: rgba(255, 255, 255, 0.9);
      --toggle-text: #1a2942;
      --toggle-border: rgba(201, 169, 110, 0.35);

      --section-alt-bg: rgba(255, 255, 255, 0.6);

      background: var(--pg-bg);
      color: var(--pg-text);
    }

    /* ============ TEMA OSCURO ============ */
    :host-context([data-theme="dark"]) {
      --pg-bg:
        radial-gradient(ellipse at 20% 0%, rgba(201, 169, 110, 0.15), transparent 45%),
        radial-gradient(ellipse at 80% 100%, rgba(30, 199, 123, 0.1), transparent 50%),
        linear-gradient(180deg, #0a1424 0%, #0f1e38 100%);
      --pg-text: #f8f1e3;
      --pg-muted: rgba(248, 241, 227, 0.55);
      --heading: #f8f1e3;

      --card-bg: linear-gradient(180deg, rgba(20, 34, 64, 0.7) 0%, rgba(15, 26, 46, 0.7) 100%);
      --card-border: rgba(201, 169, 110, 0.25);
      --card-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);

      --input-bg: rgba(10, 20, 36, 0.7);
      --input-text: #f8f1e3;
      --input-border: rgba(201, 169, 110, 0.25);
      --input-placeholder: rgba(248, 241, 227, 0.4);

      --cell-bg: linear-gradient(180deg, rgba(30, 48, 87, 0.55) 0%, rgba(20, 34, 64, 0.55) 100%);
      --cell-bg-hover: rgba(30, 48, 87, 0.9);
      --cell-text: #f8f1e3;
      --cell-border: rgba(201, 169, 110, 0.25);

      --summary-bg: linear-gradient(90deg, rgba(30, 48, 87, 0.6) 0%, rgba(20, 34, 64, 0.6) 100%);
      --summary-border: rgba(201, 169, 110, 0.35);

      --toggle-bg: rgba(20, 34, 64, 0.85);
      --toggle-text: #e8c98a;
      --toggle-border: rgba(232, 201, 138, 0.35);

      --section-alt-bg: rgba(15, 26, 46, 0.4);
    }

    .page { position: relative; }

    /* ============ TOGGLE claro/oscuro ============ */
    .theme-toggle {
      position: fixed;
      top: 20px; right: 20px;
      width: 46px; height: 46px;
      display: grid; place-items: center;
      background: var(--toggle-bg);
      color: var(--toggle-text);
      border: 1.5px solid var(--toggle-border);
      border-radius: 50%;
      cursor: pointer;
      z-index: 50;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s;
    }
    .theme-toggle:hover {
      transform: translateY(-2px) rotate(15deg);
      border-color: rgba(232, 201, 138, 0.7);
      box-shadow: 0 12px 32px rgba(232, 201, 138, 0.35);
    }
    .theme-toggle .material-icons { font-size: 22px; }
    @media (max-width: 720px) {
      .theme-toggle { top: 14px; right: 14px; width: 40px; height: 40px; }
    }

    .state {
      text-align: center;
      padding: 120px 20px;
      color: var(--pg-muted);
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

    /* ============================================================
       HERO FULL-BLEED compacto — TV protagonista, sin espacio muerto
       ============================================================ */
    .hero {
      position: relative;
      padding: 32px 24px 20px;
      background:
        radial-gradient(ellipse at 30% 40%, #1e3057 0%, transparent 50%),
        radial-gradient(ellipse at 70% 60%, #0f1a2e 0%, transparent 60%),
        linear-gradient(135deg, #050a14 0%, #0a1424 60%, #0f1e38 100%);
      color: #f8f1e3;
      overflow: hidden;
    }
    @media (max-width: 900px) { .hero { padding: 40px 20px 24px; } }

    /* Mesh gradient + luces + partículas */
    .hero__bg { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
    .hero__mesh {
      position: absolute;
      inset: -20%;
      background:
        radial-gradient(circle at 15% 30%, rgba(232, 201, 138, 0.35) 0%, transparent 40%),
        radial-gradient(circle at 85% 70%, rgba(30, 199, 123, 0.3) 0%, transparent 40%),
        radial-gradient(circle at 50% 100%, rgba(201, 169, 110, 0.25) 0%, transparent 60%);
      filter: blur(60px);
      opacity: 0.8;
      animation: mesh-drift 18s ease-in-out infinite;
    }
    @keyframes mesh-drift {
      0%, 100% { transform: translate(0, 0) scale(1); }
      33% { transform: translate(-30px, 20px) scale(1.05); }
      66% { transform: translate(20px, -20px) scale(0.98); }
    }

    /* Foco central para dar profundidad */
    .hero__spotlight {
      position: absolute;
      top: 50%; right: 25%;
      width: 700px; height: 700px;
      transform: translate(50%, -50%);
      background: radial-gradient(circle,
        rgba(232, 201, 138, 0.28) 0%,
        rgba(232, 201, 138, 0.1) 30%,
        transparent 60%);
      filter: blur(30px);
      animation: spotlight-pulse 5s ease-in-out infinite;
    }
    @keyframes spotlight-pulse {
      0%, 100% { opacity: 0.6; transform: translate(50%, -50%) scale(1); }
      50% { opacity: 1; transform: translate(50%, -50%) scale(1.05); }
    }

    /* Partículas doradas titilando */
    .hero__stars span {
      position: absolute;
      width: 4px; height: 4px;
      background: #e8c98a;
      border-radius: 50%;
      box-shadow: 0 0 10px rgba(232, 201, 138, 0.9);
      animation: twinkle 3s ease-in-out infinite;
    }
    .hero__stars span:nth-child(1)  { top: 8%;  left: 12%; animation-delay: 0.0s; }
    .hero__stars span:nth-child(2)  { top: 18%; left: 42%; animation-delay: 0.3s; }
    .hero__stars span:nth-child(3)  { top: 68%; left: 8%;  animation-delay: 0.6s; }
    .hero__stars span:nth-child(4)  { top: 88%; left: 38%; animation-delay: 0.9s; }
    .hero__stars span:nth-child(5)  { top: 14%; left: 78%; animation-delay: 0.2s; }
    .hero__stars span:nth-child(6)  { top: 42%; left: 92%; animation-delay: 0.7s; width: 3px; height: 3px; }
    .hero__stars span:nth-child(7)  { top: 74%; left: 68%; animation-delay: 1.1s; }
    .hero__stars span:nth-child(8)  { top: 92%; left: 82%; animation-delay: 1.4s; }
    .hero__stars span:nth-child(9)  { top: 32%; left: 18%; animation-delay: 0.5s; width: 3px; height: 3px; }
    .hero__stars span:nth-child(10) { top: 56%; left: 55%; animation-delay: 1.6s; width: 3px; height: 3px; }
    .hero__stars span:nth-child(11) { top: 22%; left: 62%; animation-delay: 0.8s; }
    .hero__stars span:nth-child(12) { top: 82%; left: 12%; animation-delay: 1.2s; }
    @keyframes twinkle { 0%,100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 1; transform: scale(1.5); } }

    .hero__inner {
      position: relative;
      z-index: 2;
      max-width: 1280px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 1fr 1.1fr;
      gap: 48px;
      align-items: center;
      width: 100%;
    }
    @media (max-width: 900px) { .hero__inner { grid-template-columns: 1fr; gap: 32px; } }

    /* Text side */
    .hero__text { max-width: 560px; }
    @media (max-width: 900px) { .hero__text { max-width: none; } }

    .badge {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 8px 18px;
      background: linear-gradient(135deg, rgba(30, 199, 123, 0.22) 0%, rgba(232, 201, 138, 0.18) 100%);
      color: #f8f1e3;
      border: 1px solid rgba(232, 201, 138, 0.4);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 24px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      backdrop-filter: blur(8px);
      box-shadow: 0 6px 20px rgba(232, 201, 138, 0.15);
    }
    .badge__dot {
      width: 8px; height: 8px;
      background: #1ec77b;
      border-radius: 50%;
      box-shadow: 0 0 0 4px rgba(30, 199, 123, 0.3), 0 0 12px #1ec77b;
      animation: badge-pulse 1.6s ease-in-out infinite;
    }
    .badge__sep { color: rgba(232, 201, 138, 0.6); }
    @keyframes badge-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }

    .hero__title {
      margin: 0 0 20px;
      font-size: clamp(36px, 5vw, 60px);
      line-height: 1.02;
      color: #fff;
      font-weight: 900;
      letter-spacing: -0.03em;
      background: linear-gradient(180deg, #ffffff 0%, #f8f1e3 60%, #e8c98a 120%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-shadow: 0 4px 40px rgba(232, 201, 138, 0.2);
    }
    .hero__desc {
      margin: 0 0 24px;
      color: rgba(248, 241, 227, 0.85);
      font-size: 17px;
      line-height: 1.5;
      max-width: 500px;
    }

    .welcome {
      display: flex; gap: 12px; align-items: flex-start;
      padding: 14px 18px; margin: 20px 0 24px;
      background: linear-gradient(90deg, rgba(232, 201, 138, 0.15) 0%, rgba(232, 201, 138, 0.03) 100%);
      border-left: 3px solid #e8c98a;
      border-radius: 10px;
      backdrop-filter: blur(4px);
    }
    .welcome .material-icons { color: #e8c98a; }
    .welcome p { margin: 0; font-size: 14px; }

    .hero__stats {
      display: flex; gap: 32px; margin: 28px 0 20px;
      flex-wrap: wrap;
    }
    .stat strong {
      display: block;
      font-size: clamp(24px, 3vw, 34px);
      color: #fff;
      font-weight: 800;
      letter-spacing: -0.01em;
      font-variant-numeric: tabular-nums;
    }
    .stat small {
      color: rgba(248, 241, 227, 0.65);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-weight: 700;
    }

    .progress {
      height: 12px;
      background: rgba(255,255,255,0.1);
      border-radius: 999px;
      overflow: hidden;
      box-shadow: inset 0 1px 4px rgba(0,0,0,0.35);
      position: relative;
      margin-bottom: 32px;
    }
    .progress__bar {
      height: 100%;
      background: linear-gradient(90deg, #1ec77b 0%, #e8c98a 100%);
      box-shadow: 0 0 16px rgba(30, 199, 123, 0.55);
      transition: width 0.6s ease;
      border-radius: 999px;
      position: relative;
      min-width: 8px;
    }
    .progress__bar::after {
      content: '';
      position: absolute; inset: 0;
      background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%);
      animation: shine 2s linear infinite;
    }
    @keyframes shine {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }

    .hero__ctas {
      display: flex; gap: 12px; flex-wrap: wrap;
      margin-top: 8px;
    }

    /* ============ STAGE del TV — más compacto ============ */
    .hero__stage {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 380px;
      padding: 12px;
    }
    @media (max-width: 900px) { .hero__stage { min-height: 300px; padding: 10px; } }

    .stage__halo {
      position: absolute;
      inset: 5% 8%;
      background:
        radial-gradient(ellipse at center,
          rgba(232, 201, 138, 0.4) 0%,
          rgba(232, 201, 138, 0.15) 30%,
          transparent 65%);
      filter: blur(30px);
      animation: halo-pulse 4s ease-in-out infinite;
    }
    @keyframes halo-pulse {
      0%,100% { opacity: 0.7; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.1); }
    }

    .stage__floor {
      position: absolute;
      bottom: 12%; left: 50%;
      transform: translateX(-50%);
      width: 60%;
      height: 60px;
      background: radial-gradient(ellipse at center, rgba(0,0,0,0.5) 0%, transparent 70%);
      filter: blur(15px);
      z-index: 1;
    }

    .stage__frame {
      position: relative;
      z-index: 2;
      width: 100%;
      max-width: 640px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .stage__img {
      max-width: 100%;
      max-height: 400px;
      object-fit: contain;
      filter:
        drop-shadow(0 30px 40px rgba(0, 0, 0, 0.6))
        drop-shadow(0 0 60px rgba(232, 201, 138, 0.2));
      animation: float 5s ease-in-out infinite;
    }
    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-12px); }
    }

    .stage__fallback {
      font-size: clamp(120px, 20vw, 220px);
      line-height: 1;
      filter: drop-shadow(0 20px 40px rgba(0, 0, 0, 0.5));
      animation: float 5s ease-in-out infinite;
    }

    .stage__ribbon {
      position: absolute;
      bottom: 4%;
      left: 50%;
      transform: translateX(-50%);
      z-index: 3;
      display: inline-flex; align-items: center; gap: 10px;
      padding: 12px 24px;
      background: linear-gradient(90deg, #c9a96e 0%, #e8c98a 50%, #c9a96e 100%);
      background-size: 200% 100%;
      color: #1a2942;
      font-size: 13px;
      font-weight: 800;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      box-shadow:
        0 12px 30px rgba(0, 0, 0, 0.4),
        0 0 40px rgba(232, 201, 138, 0.4),
        inset 0 1px 0 rgba(255,255,255,0.5);
      animation: ribbon-shimmer 3s linear infinite;
      white-space: nowrap;
      max-width: calc(100% - 40px);
      overflow: hidden;
      text-overflow: ellipsis;
    }
    @keyframes ribbon-shimmer { to { background-position: 200% 0; } }
    .stage__ribbon .material-icons { font-size: 18px; }

    .stage__sparkle {
      position: absolute;
      font-size: 32px;
      z-index: 3;
      animation: sparkle-float 4s ease-in-out infinite;
      filter: drop-shadow(0 0 10px rgba(232, 201, 138, 0.8));
    }
    .stage__sparkle--1 { top: 15%; right: 15%; animation-delay: 0s; }
    .stage__sparkle--2 { top: 25%; left: 8%; animation-delay: 1.2s; font-size: 26px; }
    .stage__sparkle--3 { bottom: 30%; right: 5%; animation-delay: 2s; font-size: 22px; }
    @keyframes sparkle-float {
      0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.9; }
      50% { transform: translateY(-15px) rotate(15deg); opacity: 1; }
    }

    .hero__scroll {
      display: flex; justify-content: center;
      color: rgba(232, 201, 138, 0.6);
      margin-top: 12px;
      z-index: 3;
      animation: scroll-bounce 2s ease-in-out infinite;
      position: relative;
    }
    .hero__scroll .material-icons { font-size: 26px; }
    @keyframes scroll-bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(6px); }
    }

    /* ============================================================
       SECCIONES CENTRADAS — más compactas
       ============================================================ */
    .prizes-showcase, .steps, .picker {
      max-width: 1280px;
      margin: 0 auto;
      padding: 32px 24px;
    }
    @media (max-width: 720px) {
      .prizes-showcase, .steps, .picker { padding: 28px 20px; }
    }
    .picker { padding-top: 24px; }
    .prizes-showcase, .steps { padding-top: 48px; padding-bottom: 48px; }

    .section-head { text-align: center; margin-bottom: 28px; }
    .section-tag {
      display: inline-block;
      padding: 6px 16px;
      background: linear-gradient(135deg, rgba(30, 199, 123, 0.15) 0%, rgba(232, 201, 138, 0.12) 100%);
      color: var(--pg-text);
      border: 1px solid var(--card-border);
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 12px;
    }
    .section-head h2 {
      margin: 0 0 6px;
      font-size: clamp(22px, 3vw, 30px);
      font-weight: 800;
      color: var(--heading);
      letter-spacing: -0.02em;
    }
    .section-head p { margin: 0; color: var(--pg-muted); font-size: 14px; }

    /* ============ BUSCADOR compacto integrado ============ */
    .quick-search {
      margin: 0 0 24px;
      padding: 16px 18px;
      background: linear-gradient(135deg, rgba(232, 201, 138, 0.1) 0%, rgba(30, 199, 123, 0.06) 100%);
      border: 1px solid var(--card-border);
      border-radius: 16px;
    }
    .quick-search__label {
      display: flex; align-items: center; gap: 6px;
      font-size: 11px;
      font-weight: 800;
      color: var(--pg-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 10px;
    }
    .quick-search__label .material-icons { font-size: 14px; color: #c9a96e; }
    .quick-search__form { display: flex; gap: 8px; flex-wrap: wrap; }
    .quick-search__input {
      flex: 1;
      min-width: 180px;
      padding: 12px 16px;
      background: var(--input-bg);
      color: var(--input-text);
      border: 1.5px solid var(--input-border);
      border-radius: 10px;
      font-size: 16px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .quick-search__input::placeholder { color: var(--input-placeholder); font-weight: 400; }
    .quick-search__input:focus {
      outline: none;
      border-color: #1ec77b;
      box-shadow: 0 0 0 3px rgba(30, 199, 123, 0.15);
    }
    .btn__spin {
      display: inline-block;
      width: 14px; height: 14px;
      border: 2px solid rgba(255,255,255,0.4);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      margin-right: 6px;
    }

    .search-result {
      margin: 14px 0 0;
      position: relative;
      display: flex; gap: 12px; align-items: flex-start;
      padding: 16px 18px;
      background: var(--card-bg);
      border-radius: 12px;
      border-left: 4px solid;
      box-shadow: var(--card-shadow);
    }

    /* ============ PREMIOS MOSAICO PREMIUM ============ */
    .prizes-showcase { background: var(--section-alt-bg); }
    .prizes-mosaic {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
    }
    .prize-tile {
      position: relative;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 16px;
      align-items: center;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 20px;
      box-shadow: var(--card-shadow);
      transition: transform 0.18s, box-shadow 0.18s, border-color 0.18s;
      overflow: hidden;
    }
    .prize-tile::before {
      content: '';
      position: absolute; inset: 0;
      background: linear-gradient(135deg, rgba(232, 201, 138, 0.08) 0%, transparent 50%);
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.18s;
    }
    .prize-tile:hover {
      transform: translateY(-3px);
      border-color: rgba(232, 201, 138, 0.5);
      box-shadow: 0 20px 40px rgba(201, 169, 110, 0.18);
    }
    .prize-tile:hover::before { opacity: 1; }

    .prize-tile--top {
      grid-column: 1 / -1;
      grid-template-columns: auto 1fr auto;
      background:
        radial-gradient(ellipse at right, rgba(232, 201, 138, 0.15) 0%, transparent 60%),
        var(--card-bg);
      border-color: rgba(232, 201, 138, 0.55);
      box-shadow:
        0 12px 30px rgba(201, 169, 110, 0.22),
        0 0 0 1px rgba(232, 201, 138, 0.35);
      padding: 24px 28px;
    }
    .prize-tile--top::after {
      content: '★';
      position: absolute;
      top: 12px; right: 16px;
      color: #e8c98a;
      font-size: 20px;
      filter: drop-shadow(0 0 8px rgba(232, 201, 138, 0.8));
    }

    .prize-tile__index {
      display: grid; place-items: center;
      width: 44px; height: 44px;
      background: linear-gradient(135deg, rgba(232, 201, 138, 0.2) 0%, rgba(201, 169, 110, 0.1) 100%);
      color: #c9a96e;
      font-weight: 900;
      font-size: 15px;
      font-variant-numeric: tabular-nums;
      border-radius: 12px;
      border: 1px solid rgba(232, 201, 138, 0.3);
      letter-spacing: -0.02em;
    }
    .prize-tile--top .prize-tile__index {
      background: linear-gradient(135deg, #c9a96e 0%, #e8c98a 100%);
      color: #1a2942;
      border-color: transparent;
      box-shadow: 0 4px 12px rgba(201, 169, 110, 0.5);
    }

    .prize-tile__icon {
      display: grid; place-items: center;
      width: 56px; height: 56px;
      background: linear-gradient(135deg, rgba(30, 199, 123, 0.1) 0%, rgba(232, 201, 138, 0.06) 100%);
      border-radius: 14px;
      border: 1px solid rgba(232, 201, 138, 0.2);
    }
    .prize-tile__icon span {
      font-size: 34px;
      line-height: 1;
      filter: drop-shadow(0 3px 6px rgba(0,0,0,0.15));
    }
    .prize-tile--top .prize-tile__icon {
      width: 72px; height: 72px;
      background: linear-gradient(135deg, rgba(232, 201, 138, 0.25) 0%, rgba(201, 169, 110, 0.15) 100%);
      border-color: rgba(232, 201, 138, 0.5);
    }
    .prize-tile--top .prize-tile__icon span { font-size: 44px; }

    .prize-tile__body { min-width: 0; }
    .prize-tile__tag {
      font-size: 10px;
      font-weight: 800;
      color: #c9a96e;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 4px;
    }
    .prize-tile h3 {
      margin: 0 0 6px;
      font-size: 16px;
      color: var(--heading);
      font-weight: 700;
      line-height: 1.25;
    }
    .prize-tile--top h3 { font-size: 22px; }
    .prize-tile__date {
      display: inline-flex; align-items: center; gap: 4px;
      color: var(--pg-muted);
      font-size: 12px;
    }
    .prize-tile__date .material-icons { font-size: 14px; }

    /* Reemplazamos las clases viejas por si algo aún las referencia */
    .prizes-grid, .prize-card, .prize-card--top, .prize-card__crown,
    .prize-card__emoji, .prize-card__pos, .prize-card__date { display: none; }

    /* ============ CÓMO FUNCIONA — flow horizontal con connectors ============ */
    .steps__flow {
      display: flex;
      align-items: stretch;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .step-item {
      flex: 1;
      min-width: 220px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 24px 22px 22px;
      text-align: center;
      box-shadow: var(--card-shadow);
      transition: transform 0.18s, border-color 0.18s;
    }
    .step-item:hover { transform: translateY(-3px); border-color: rgba(30, 199, 123, 0.35); }

    .step-item__badge {
      position: relative;
      width: 68px; height: 68px;
      margin: 0 auto 16px;
      display: grid; place-items: center;
      background: linear-gradient(135deg, #1ec77b 0%, #16a366 100%);
      border-radius: 20px;
      box-shadow:
        0 10px 26px rgba(30, 199, 123, 0.4),
        inset 0 1px 0 rgba(255,255,255,0.3);
    }
    .step-item__badge .material-icons { font-size: 32px; color: #fff; }
    .step-item__num {
      position: absolute;
      top: -8px; right: -8px;
      background: linear-gradient(135deg, #c9a96e 0%, #e8c98a 100%);
      color: #1a2942;
      font-weight: 900;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 999px;
      box-shadow: 0 3px 8px rgba(201, 169, 110, 0.5);
      letter-spacing: 0.02em;
    }
    .step-item h3 {
      margin: 0 0 6px;
      font-size: 17px;
      color: var(--heading);
      font-weight: 700;
    }
    .step-item p {
      margin: 0;
      color: var(--pg-muted);
      font-size: 13px;
      line-height: 1.5;
    }

    .steps__connector {
      display: grid; place-items: center;
      color: rgba(201, 169, 110, 0.55);
      flex-shrink: 0;
      align-self: center;
    }
    @media (max-width: 900px) {
      .steps__connector { transform: rotate(90deg); }
      .step-item { min-width: 100%; }
    }
    @media (max-width: 720px) {
      .steps__connector { display: none; }
    }
    .search-result__body { flex: 1; }
    .search-result .material-icons { font-size: 32px; margin-top: 2px; }
    .search-result strong { display: block; font-size: 16px; margin-bottom: 6px; color: var(--heading); }
    .search-result p { margin: 0 0 12px; font-size: 14px; color: var(--pg-text); opacity: 0.85; }
    .search-result__actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .search-result__close {
      position: absolute;
      top: 8px; right: 10px;
      background: transparent; border: none;
      font-size: 22px; line-height: 1;
      color: var(--pg-muted); cursor: pointer;
      padding: 4px 8px;
    }
    .search-result--available { border-color: #1ec77b; }
    .search-result--available .material-icons { color: #0b8a4a; }
    .search-result--sold { border-color: #ef4444; }
    .search-result--sold .material-icons { color: #b91c1c; }
    .search-result--reserved { border-color: #f59e0b; }
    .search-result--reserved .material-icons { color: #b45309; }
    .search-result--assigned { border-color: #3b82f6; }
    .search-result--assigned .material-icons { color: #1d4ed8; }
    .search-result--not_found { border-color: #6b7280; }
    .search-result--not_found .material-icons { color: #4b5563; }

    /* ============ PICKER + GRID ============ */
    .picker__head {
      display: flex; justify-content: space-between; align-items: flex-start;
      flex-wrap: wrap; gap: 16px; margin-bottom: 28px;
    }
    .picker__head h2 { margin: 4px 0 4px; font-size: 26px; color: var(--heading); font-weight: 800; letter-spacing: -0.02em; }
    .picker__head p { margin: 0; }
    .picker__legend { display: flex; gap: 8px; }
    .chip {
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .chip--free { background: rgba(30, 199, 123, 0.12); color: #0b8a4a; border: 1px solid rgba(30, 199, 123, 0.35); }
    .chip--sel { background: linear-gradient(135deg, #1ec77b 0%, #16a366 100%); color: #fff; }

    .empty {
      text-align: center;
      padding: 60px 20px;
      color: var(--pg-muted);
    }
    .empty .big { font-size: 72px; color: #c9a96e; opacity: 0.6; margin-bottom: 12px; }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
      gap: 10px;
      margin-bottom: 20px;
    }
    .grid-skeleton {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
      gap: 10px;
    }
    .skeleton-cell {
      height: 54px;
      background: linear-gradient(90deg, rgba(201, 169, 110, 0.08) 0%, rgba(201, 169, 110, 0.18) 50%, rgba(201, 169, 110, 0.08) 100%);
      background-size: 200% 100%;
      border-radius: 10px;
      animation: skel 1.4s linear infinite;
    }
    @keyframes skel { to { background-position: -200% 0; } }
    .cell {
      padding: 14px 4px;
      background: var(--cell-bg);
      border: 1.5px solid var(--cell-border);
      border-radius: 10px;
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      font-size: 15px;
      color: var(--cell-text);
      cursor: pointer;
      transition: all 0.15s;
      font-variant-numeric: tabular-nums;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }
    .cell:hover {
      background: var(--cell-bg-hover);
      border-color: #c9a96e;
      transform: translateY(-2px);
      box-shadow: 0 6px 14px rgba(201, 169, 110, 0.25);
    }
    .cell--selected {
      background: linear-gradient(135deg, #1ec77b 0%, #16a366 100%) !important;
      color: #fff !important;
      border-color: #0b8a4a !important;
      box-shadow: 0 6px 16px rgba(30, 199, 123, 0.4);
    }
    .cell--pulse { animation: cell-pulse 1.4s ease-in-out 2; }
    @keyframes cell-pulse {
      0%,100% { transform: scale(1); box-shadow: 0 6px 16px rgba(30, 199, 123, 0.4); }
      50% { transform: scale(1.12); box-shadow: 0 10px 24px rgba(30, 199, 123, 0.6); }
    }

    .summary {
      position: sticky;
      bottom: 16px;
      display: flex; justify-content: space-between; align-items: center;
      padding: 20px 24px; margin-top: 24px;
      background: var(--summary-bg);
      border-radius: 16px;
      font-size: 15px;
      flex-wrap: wrap; gap: 14px;
      border: 1px solid var(--summary-border);
      color: var(--pg-text);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.15);
      backdrop-filter: blur(10px);
    }
    .summary__info strong { color: var(--heading); }

    /* ============ BOTONES ============ */
    .btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 12px 22px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      border: 1px solid transparent;
      transition: transform 0.1s, box-shadow 0.15s, filter 0.15s;
      text-decoration: none;
      justify-content: center;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn.primary {
      background: linear-gradient(135deg, #1ec77b 0%, #16a366 100%);
      color: #fff;
      box-shadow: 0 6px 20px rgba(30, 199, 123, 0.35);
    }
    .btn.primary:hover:not(:disabled) {
      transform: translateY(-1px);
      filter: brightness(1.08);
      box-shadow: 0 10px 26px rgba(30, 199, 123, 0.5);
    }
    .btn.ghost {
      background: transparent;
      border-color: var(--input-border);
      color: var(--pg-text);
    }
    .btn.ghost:hover:not(:disabled) { background: rgba(127, 127, 127, 0.08); }
    .btn.ghost-light {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(232, 201, 138, 0.4);
      color: #f8f1e3;
      backdrop-filter: blur(6px);
    }
    .btn.ghost-light:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(232, 201, 138, 0.7);
    }
    .btn--lg { padding: 16px 28px; font-size: 15px; }
    .btn--xl { padding: 18px 32px; font-size: 16px; border-radius: 14px; }
    .btn--sm { padding: 8px 14px; font-size: 13px; }
    .btn .material-icons { font-size: 18px; }

    /* ============ FOOTER ============ */
    .foot {
      text-align: center;
      color: var(--pg-muted);
      font-size: 12px;
      padding: 40px 20px;
      max-width: 720px;
      margin: 0 auto;
    }
    .foot__brand {
      display: inline-flex; align-items: center; gap: 8px;
      font-weight: 800;
      color: var(--heading);
      font-size: 14px;
      margin-bottom: 8px;
    }
    .foot__dot {
      width: 8px; height: 8px; background: #1ec77b;
      border-radius: 50%;
      box-shadow: 0 0 0 4px rgba(30, 199, 123, 0.25);
    }
    .foot p { margin: 0 0 4px; }
    .foot__lot { margin-top: 8px !important; }

    /* ============ MODAL ============ */
    .modal {
      position: fixed; inset: 0;
      background: rgba(10, 14, 12, 0.75);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      z-index: 100;
      animation: fadeIn 0.18s;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .modal__card {
      position: relative;
      background: var(--card-bg);
      color: var(--pg-text);
      border-radius: 20px;
      padding: 32px 28px;
      max-width: 460px;
      width: 100%;
      max-height: 92vh;
      overflow-y: auto;
      box-shadow: 0 25px 70px rgba(0,0,0,0.4);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(10px);
    }
    .modal__card--wide { max-width: 620px; padding: 24px 20px; }
    .modal__close {
      position: absolute;
      top: 12px; right: 14px;
      background: transparent; border: none;
      font-size: 28px; line-height: 1;
      color: var(--pg-muted); cursor: pointer;
      padding: 4px 10px;
      border-radius: 8px;
      z-index: 2;
    }
    .modal__close:hover { background: rgba(127,127,127,0.1); color: var(--heading); }
    .modal__card h2 { margin: 0 0 6px; font-size: 22px; color: var(--heading); }
    .modal__lead { margin: 0 0 8px; color: var(--pg-muted); font-size: 14px; }

    /* ============ PREVIEW ============ */
    .preview-head { text-align: center; margin-bottom: 16px; padding-top: 6px; }
    .preview-head h2 { font-size: 22px; margin-bottom: 4px; color: var(--heading); }
    .preview-head p { margin: 0; color: var(--pg-muted); font-size: 13px; }
    .preview-ticket {
      display: flex;
      justify-content: center;
      padding: 8px 0 16px;
    }
    .preview-actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-top: 8px;
      border-top: 1px solid var(--card-border);
    }

    /* ============ FORMULARIO ============ */
    .form { display: grid; gap: 14px; margin-top: 20px; }
    .field { display: grid; gap: 6px; }
    .field span {
      font-weight: 700; letter-spacing: 0.02em;
      color: var(--pg-muted); text-transform: uppercase; font-size: 11px;
    }
    .field input {
      background: var(--input-bg) !important;
      color: var(--input-text) !important;
      -webkit-text-fill-color: var(--input-text) !important;
      caret-color: var(--input-text);
      padding: 14px 16px;
      border: 1.5px solid var(--input-border);
      border-radius: 10px;
      font-size: 15px;
      font-family: inherit;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .field input::placeholder { color: var(--input-placeholder) !important; opacity: 1; }
    .field input:focus {
      outline: none;
      border-color: #1ec77b;
      box-shadow: 0 0 0 4px rgba(30, 199, 123, 0.15);
    }
    .field input:-webkit-autofill,
    .field input:-webkit-autofill:hover,
    .field input:-webkit-autofill:focus {
      -webkit-box-shadow: 0 0 0 40px #ffffff inset !important;
      -webkit-text-fill-color: #1a2942 !important;
    }
    :host-context([data-theme="dark"]) .field input:-webkit-autofill,
    :host-context([data-theme="dark"]) .field input:-webkit-autofill:hover,
    :host-context([data-theme="dark"]) .field input:-webkit-autofill:focus {
      -webkit-box-shadow: 0 0 0 40px #142240 inset !important;
      -webkit-text-fill-color: #f8f1e3 !important;
    }

    .or { text-align: center; margin: 6px 0; color: var(--pg-muted); font-size: 12px; }
    .muted { color: var(--pg-muted); font-size: 13px; margin: 4px 0 0; }

    .alert {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 14px; margin-top: 14px;
      background: rgba(239, 68, 68, 0.1);
      color: #b91c1c;
      border-radius: 10px;
      font-size: 13px;
    }
  `],
})
export class PublicPurchaseComponent implements OnInit {
  private readonly svc = inject(PublicSalesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly theme = inject(ThemeService);

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

  // Preview de boleta (modal con diseño real de cancha + números)
  previewOpen = signal(false);
  previewLoading = signal(false);
  previewData = signal<PublicTicketDetail | null>(null);
  previewTicketId = signal<number | null>(null);

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

  /** Adapta la PublicTicketDetail al modelo Ticket que TicketDesignComponent
   *  espera. Solo mapea los campos que el diseño usa. */
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
    if (/(reloj|smartwatch)/.test(n)) return '⌚';
    if (/(cámara|camara)/.test(n)) return '📷';
    return '🏆';
  }

  heroPrizeEmoji = computed(() => this.prizeEmoji(this.topPrizeName()));

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

  /** Al hacer clic en una celda del grid, abre el modal de preview con el
   *  diseño real de la boleta (los 20 números en la cancha). */
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

  /** Agrega la boleta previewed a la selección y cierra el modal. */
  selectAndClosePreview() {
    const id = this.previewTicketId();
    if (id != null) this.toggle(id);
    this.closePreview();
  }

  /** Camino rápido: reserva la boleta previewed y abre checkout ya. */
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
          status: 'not_found', number_label: q,
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

  scrollToGrid() {
    document.getElementById('grid-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  scrollToSearch() {
    document.getElementById('search-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
