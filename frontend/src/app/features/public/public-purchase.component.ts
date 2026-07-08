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
  TicketLookup,
} from '@core/services/public-sales.service';
import { ThemeService } from '@core/services/theme.service';

/**
 * Portal PÚBLICO de compra online de boletas.
 *
 * Ruta: /rifa/:id/comprar
 *
 * Flujo:
 *   1. Hero premium con nombre, premios, %vendido y card del premio
 *   2. Buscador por número: cliente escribe "2565" y le decimos si está
 *      disponible / vendida / reservada / asignada a vendedor
 *   3. Grid de boletas disponibles (solo las que NO tienen seller humano)
 *   4. Cliente selecciona 1-10 boletas
 *   5. Modal con formulario (fondo blanco, letra oscura — legible)
 *   6. Redirige a Wompi o abre flujo manual
 *
 * Vendedor: en compras online NO hay vendedor humano (seller_id NULL),
 * la venta queda directamente asociada al tenant/organizador.
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

        <!-- Toggle claro/oscuro flotante -->
        <button class="theme-toggle" type="button"
                (click)="theme.toggle()"
                [attr.aria-label]="theme.isDark() ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
                [title]="theme.isDark() ? 'Modo claro' : 'Modo oscuro'">
          <span class="material-icons">{{ theme.isDark() ? 'light_mode' : 'dark_mode' }}</span>
        </button>

        <!-- ============ HERO PREMIUM ============ -->
        <header class="hero">
          <!-- Ornamentos decorativos -->
          <div class="hero__glow hero__glow--gold"></div>
          <div class="hero__glow hero__glow--emerald"></div>
          <div class="hero__stars" aria-hidden="true">
            <span></span><span></span><span></span><span></span>
            <span></span><span></span><span></span><span></span>
          </div>

          <div class="hero__grid">

            <!-- COL izquierda: info + premios + stats -->
            <div class="hero__info">
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

              <!-- STRIP de premios: cards horizontales sobre gold accent -->
              @if (r.prizes.length) {
                <div class="prize-strip">
                  @for (p of r.prizes; track p.position; let idx = $index) {
                    <div class="prize-mini" [class.prize-mini--top]="idx === 0">
                      <div class="prize-mini__emoji">{{ prizeEmoji(p.name) }}</div>
                      <div class="prize-mini__body">
                        <small>{{ idx === 0 ? 'Premio mayor' : 'Premio ' + (idx + 1) }}</small>
                        <strong>{{ p.name }}</strong>
                        @if (p.draw_date) {
                          <em>sorteo · {{ formatDate(p.draw_date) }}</em>
                        }
                      </div>
                    </div>
                  }
                </div>
              }

              <!-- STATS -->
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
                    <small>último sorteo</small>
                  </div>
                }
              </div>

              <div class="progress" [attr.aria-label]="r.sold_pct + '% vendido'">
                <div class="progress__bar" [style.width.%]="r.sold_pct"></div>
              </div>
            </div>

            <!-- COL derecha: display luxe del premio mayor -->
            <aside class="hero__display">
              <div class="hero__display-frame">
                @if (r.logo_url) {
                  <img [src]="r.logo_url" [alt]="topPrizeName()"
                       class="hero__display-img" />
                } @else {
                  <div class="hero__display-fallback">
                    <div class="hero__display-emoji">{{ heroPrizeEmoji() || '🏆' }}</div>
                  </div>
                }
                <div class="hero__display-glow"></div>
              </div>

              <div class="hero__display-ribbon">
                <span class="material-icons">emoji_events</span>
                <span>{{ topPrizeName() }}</span>
              </div>
            </aside>
          </div>
        </header>


        <!-- BUSCADOR POR NÚMERO -->
        <section class="search-card">
          <div class="search-card__head">
            <span class="material-icons">search</span>
            <div>
              <h2>¿Buscas un número en específico?</h2>
              <p>Escribe el número (ej: <strong>2565</strong>) y te decimos si está disponible.</p>
            </div>
          </div>
          <form class="search-form" (ngSubmit)="doSearch()">
            <input
              type="number"
              class="search-input"
              [(ngModel)]="searchInput"
              name="searchInput"
              [placeholder]="'Ej: ' + searchPlaceholder()"
              [min]="1"
              inputmode="numeric" />
            <button type="submit" class="btn primary" [disabled]="searching()">
              @if (searching()) {
                <span class="btn__spin"></span> Buscando...
              } @else {
                <span class="material-icons">search</span> Buscar
              }
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
              <div>
                <strong>Boleta {{ sr.number_label }}</strong>
                <p>{{ sr.message }}</p>
                @if (sr.status === 'available' && sr.ticket_id) {
                  <button type="button" class="btn primary btn--sm"
                          (click)="selectFromSearch(sr.ticket_id!)">
                    <span class="material-icons">add_shopping_cart</span>
                    Reservar esta boleta
                  </button>
                }
              </div>
              <button class="search-result__close" (click)="clearSearch()"
                      aria-label="Cerrar">×</button>
            </div>
          }
        </section>

        <!-- GRID DE BOLETAS -->
        <section class="picker">
          <div class="picker__head">
            <div>
              <h2>Elige tu boleta</h2>
              <p class="muted">Toca los números que quieres reservar.</p>
            </div>
            <div class="picker__legend">
              <span class="chip chip--free">Disponible</span>
              <span class="chip chip--sel">Seleccionada</span>
            </div>
          </div>

          @if (loadingTickets()) {
            <p class="muted">Cargando boletas disponibles...</p>
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
                        (click)="toggle(t.id)">
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

        <!-- FOOTER premium -->
        <footer class="foot">
          <div class="foot__brand">
            <span class="foot__dot"></span>
            <span>Boletera</span>
          </div>
          <p>Compra segura · Verificación pública de tus boletas · Sorteo con Lotería.</p>
        </footer>

      }

      <!-- MODAL CHECKOUT -->
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
        radial-gradient(circle at 20% 0%, rgba(201, 169, 110, 0.25), transparent 40%),
        radial-gradient(circle at 80% 100%, rgba(30, 199, 123, 0.18), transparent 45%),
        linear-gradient(180deg, #faf6ee 0%, #f0e5c8 100%);
      --pg-text: #1a2942;
      --pg-muted: #6b7280;

      --card-bg: #ffffff;
      --card-border: rgba(201, 169, 110, 0.12);
      --card-shadow: 0 4px 24px rgba(26, 41, 66, 0.06);

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

      --heading: #1a2942;

      background: var(--pg-bg);
      color: var(--pg-text);
    }

    /* ============ TEMA OSCURO ============ */
    :host-context([data-theme="dark"]) {
      --pg-bg:
        radial-gradient(circle at 20% 0%, rgba(201, 169, 110, 0.2), transparent 45%),
        radial-gradient(circle at 80% 100%, rgba(30, 199, 123, 0.15), transparent 50%),
        linear-gradient(180deg, #0a1424 0%, #142240 100%);
      --pg-text: #f8f1e3;
      --pg-muted: rgba(248, 241, 227, 0.6);

      --card-bg: linear-gradient(180deg, rgba(20, 34, 64, 0.75) 0%, rgba(15, 26, 46, 0.75) 100%);
      --card-border: rgba(201, 169, 110, 0.25);
      --card-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);

      --input-bg: rgba(10, 20, 36, 0.7);
      --input-text: #f8f1e3;
      --input-border: rgba(201, 169, 110, 0.25);
      --input-placeholder: rgba(248, 241, 227, 0.4);

      --cell-bg: linear-gradient(180deg, rgba(30, 48, 87, 0.6) 0%, rgba(20, 34, 64, 0.6) 100%);
      --cell-bg-hover: rgba(30, 48, 87, 0.9);
      --cell-text: #f8f1e3;
      --cell-border: rgba(201, 169, 110, 0.25);

      --summary-bg: linear-gradient(90deg, rgba(30, 48, 87, 0.6) 0%, rgba(20, 34, 64, 0.6) 100%);
      --summary-border: rgba(201, 169, 110, 0.35);

      --toggle-bg: rgba(20, 34, 64, 0.85);
      --toggle-text: #e8c98a;
      --toggle-border: rgba(232, 201, 138, 0.35);

      --heading: #f8f1e3;
    }

    .page { max-width: 1080px; margin: 0 auto; padding: 24px 16px 60px; position: relative; }

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
      padding: 80px 20px;
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

    /* ============ HERO PREMIUM v2 ============ */
    .hero {
      position: relative;
      background:
        radial-gradient(circle at 100% 0%, rgba(201, 169, 110, 0.22), transparent 55%),
        radial-gradient(circle at 0% 100%, rgba(30, 199, 123, 0.15), transparent 55%),
        linear-gradient(135deg, #0a1424 0%, #142240 40%, #1e3057 100%);
      color: #f8f1e3;
      border-radius: 28px;
      padding: 48px 40px;
      margin-bottom: 32px;
      box-shadow:
        0 40px 100px -30px rgba(10, 20, 36, 0.7),
        0 0 0 1px rgba(201, 169, 110, 0.18),
        inset 0 1px 0 rgba(255, 255, 255, 0.05);
      overflow: hidden;
    }
    @media (max-width: 720px) { .hero { padding: 28px 22px; border-radius: 22px; } }

    /* Glow decorativos animados */
    .hero__glow {
      position: absolute;
      border-radius: 50%;
      filter: blur(60px);
      pointer-events: none;
      animation: glow-drift 12s ease-in-out infinite;
    }
    .hero__glow--gold {
      width: 380px; height: 380px;
      top: -140px; right: -100px;
      background: radial-gradient(circle, rgba(232, 201, 138, 0.45) 0%, transparent 65%);
    }
    .hero__glow--emerald {
      width: 320px; height: 320px;
      bottom: -120px; left: -80px;
      background: radial-gradient(circle, rgba(30, 199, 123, 0.4) 0%, transparent 65%);
      animation-delay: -6s;
    }
    @keyframes glow-drift {
      0%, 100% { transform: translate(0, 0); opacity: 0.85; }
      50% { transform: translate(30px, -20px); opacity: 1; }
    }

    /* Estrellas / partículas sutiles */
    .hero__stars {
      position: absolute; inset: 0;
      pointer-events: none;
      overflow: hidden;
    }
    .hero__stars span {
      position: absolute;
      width: 3px; height: 3px;
      background: #e8c98a;
      border-radius: 50%;
      box-shadow: 0 0 8px rgba(232, 201, 138, 0.8);
      animation: twinkle 3s ease-in-out infinite;
    }
    .hero__stars span:nth-child(1) { top: 12%; left: 8%; animation-delay: 0s; }
    .hero__stars span:nth-child(2) { top: 22%; left: 42%; animation-delay: 0.4s; }
    .hero__stars span:nth-child(3) { top: 68%; left: 12%; animation-delay: 0.8s; }
    .hero__stars span:nth-child(4) { top: 84%; left: 38%; animation-delay: 1.2s; }
    .hero__stars span:nth-child(5) { top: 18%; left: 78%; animation-delay: 0.2s; }
    .hero__stars span:nth-child(6) { top: 46%; left: 88%; animation-delay: 0.6s; }
    .hero__stars span:nth-child(7) { top: 74%; left: 72%; animation-delay: 1.0s; }
    .hero__stars span:nth-child(8) { top: 92%; left: 62%; animation-delay: 1.4s; }
    @keyframes twinkle { 0%,100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 1; transform: scale(1.4); } }

    .hero__grid {
      position: relative;
      display: grid;
      grid-template-columns: 1.35fr 1fr;
      gap: 40px;
      align-items: center;
      z-index: 2;
    }
    @media (max-width: 900px) { .hero__grid { grid-template-columns: 1fr; gap: 32px; } }

    .badge {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 7px 16px;
      background: linear-gradient(135deg, rgba(30, 199, 123, 0.22) 0%, rgba(201, 169, 110, 0.18) 100%);
      color: #f8f1e3;
      border: 1px solid rgba(201, 169, 110, 0.4);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 20px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      backdrop-filter: blur(4px);
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
      margin: 0 0 14px;
      font-size: 40px;
      line-height: 1.05;
      color: #fff;
      font-weight: 800;
      letter-spacing: -0.02em;
      background: linear-gradient(180deg, #ffffff 0%, #f8f1e3 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-shadow: 0 4px 30px rgba(232, 201, 138, 0.15);
    }
    @media (max-width: 720px) { .hero__title { font-size: 28px; } }
    .hero__desc { margin: 0 0 18px; color: rgba(248, 241, 227, 0.85); font-size: 15px; line-height: 1.5; }

    .welcome {
      display: flex; gap: 12px; align-items: flex-start;
      padding: 14px 18px; margin: 16px 0 20px;
      background: linear-gradient(90deg, rgba(232, 201, 138, 0.15) 0%, rgba(232, 201, 138, 0.05) 100%);
      border-left: 3px solid #e8c98a;
      border-radius: 10px;
      backdrop-filter: blur(4px);
    }
    .welcome .material-icons { color: #e8c98a; }
    .welcome p { margin: 0; font-size: 14px; }

    /* ============ Strip de premios (mini-cards) ============ */
    .prize-strip {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 10px;
      margin: 20px 0 24px;
    }
    .prize-mini {
      position: relative;
      display: flex; gap: 10px; align-items: center;
      padding: 12px 14px;
      background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%);
      border: 1px solid rgba(201, 169, 110, 0.25);
      border-radius: 12px;
      backdrop-filter: blur(6px);
      transition: transform 0.15s, border-color 0.15s;
    }
    .prize-mini:hover { transform: translateY(-2px); border-color: rgba(232, 201, 138, 0.5); }
    .prize-mini--top {
      background: linear-gradient(135deg, rgba(232, 201, 138, 0.2) 0%, rgba(201, 169, 110, 0.08) 100%);
      border-color: rgba(232, 201, 138, 0.6);
      box-shadow: 0 0 20px rgba(232, 201, 138, 0.15);
    }
    .prize-mini__emoji {
      font-size: 28px;
      line-height: 1;
      flex-shrink: 0;
      filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4));
    }
    .prize-mini__body { display: flex; flex-direction: column; min-width: 0; }
    .prize-mini__body small {
      color: #e8c98a;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 700;
    }
    .prize-mini__body strong {
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.2;
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .prize-mini__body em {
      color: rgba(248, 241, 227, 0.55);
      font-style: normal;
      font-size: 10px;
      margin-top: 2px;
    }

    /* ============ Stats + progreso ============ */
    .hero__stats { display: flex; gap: 24px; margin: 20px 0 14px; flex-wrap: wrap; }
    .stat { flex: 1; min-width: 110px; }
    .stat strong {
      display: block;
      font-size: 28px;
      color: #fff;
      font-weight: 800;
      letter-spacing: -0.01em;
      font-variant-numeric: tabular-nums;
    }
    .stat small { color: rgba(248, 241, 227, 0.65); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }

    .progress {
      height: 12px;
      background: rgba(255,255,255,0.08);
      border-radius: 999px;
      overflow: hidden;
      box-shadow: inset 0 1px 4px rgba(0,0,0,0.35);
      position: relative;
    }
    .progress__bar {
      height: 100%;
      background: linear-gradient(90deg, #1ec77b 0%, #e8c98a 100%);
      box-shadow: 0 0 16px rgba(30, 199, 123, 0.55);
      transition: width 0.6s ease;
      border-radius: 999px;
      position: relative;
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

    /* ============ Display luxe del premio mayor ============ */
    .hero__display {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .hero__display-frame {
      position: relative;
      width: 100%;
      aspect-ratio: 4 / 3;
      background:
        radial-gradient(ellipse at center, rgba(232, 201, 138, 0.2) 0%, transparent 60%),
        linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%);
      border: 1.5px solid rgba(232, 201, 138, 0.35);
      border-radius: 20px;
      padding: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.08),
        0 20px 60px -20px rgba(10, 20, 36, 0.6);
    }
    /* Halo dorado detrás del producto */
    .hero__display-glow {
      position: absolute;
      inset: 20% 15%;
      background: radial-gradient(circle, rgba(232, 201, 138, 0.35) 0%, transparent 70%);
      filter: blur(20px);
      z-index: 0;
      animation: display-pulse 4s ease-in-out infinite;
    }
    @keyframes display-pulse { 0%,100% { opacity: 0.7; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }

    .hero__display-img {
      position: relative;
      z-index: 1;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      filter: drop-shadow(0 20px 30px rgba(0,0,0,0.5));
      animation: float 4s ease-in-out infinite;
    }
    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-8px); }
    }

    .hero__display-fallback {
      position: relative;
      z-index: 1;
      text-align: center;
    }
    .hero__display-emoji {
      font-size: 140px;
      line-height: 1;
      filter: drop-shadow(0 20px 32px rgba(0,0,0,0.5));
      animation: float 4s ease-in-out infinite;
    }
    @media (max-width: 720px) { .hero__display-emoji { font-size: 100px; } }

    .hero__display-ribbon {
      display: inline-flex;
      align-items: center; gap: 8px;
      padding: 10px 20px;
      background: linear-gradient(90deg, #c9a96e 0%, #e8c98a 50%, #c9a96e 100%);
      background-size: 200% 100%;
      color: #1a2942;
      font-size: 12px;
      font-weight: 800;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      box-shadow:
        0 8px 20px rgba(201, 169, 110, 0.5),
        inset 0 1px 0 rgba(255,255,255,0.4);
      animation: ribbon-shimmer 3s linear infinite;
      max-width: 100%;
    }
    @keyframes ribbon-shimmer { to { background-position: 200% 0; } }
    .hero__display-ribbon .material-icons { font-size: 16px; }
    .hero__display-ribbon span:not(.material-icons) {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 320px;
    }

    /* ============ SECCIONES (buscador + picker) ============ */
    .search-card, .picker {
      background: var(--card-bg);
      border-radius: 20px;
      padding: 24px 28px;
      margin-bottom: 24px;
      box-shadow: var(--card-shadow), 0 0 0 1px var(--card-border);
      backdrop-filter: blur(6px);
    }
    @media (max-width: 720px) {
      .search-card, .picker { padding: 20px; border-radius: 16px; }
    }

    .search-card h2, .picker h2 {
      margin: 0 0 12px; font-size: 20px; font-weight: 700; color: var(--heading);
      display: inline-flex; align-items: center; gap: 8px;
    }

    /* ============ BUSCADOR ============ */
    .search-card__head {
      display: flex; gap: 14px; align-items: flex-start;
      margin-bottom: 16px;
    }
    .search-card__head .material-icons {
      font-size: 32px;
      color: #c9a96e;
      background: rgba(201, 169, 110, 0.14);
      padding: 8px;
      border-radius: 12px;
    }
    .search-card__head h2 { margin: 0 0 2px; font-size: 17px; }
    .search-card__head p { margin: 0; color: var(--pg-muted); font-size: 13px; }

    .search-form { display: flex; gap: 10px; flex-wrap: wrap; }
    .search-input {
      flex: 1;
      min-width: 160px;
      padding: 14px 18px;
      background: var(--input-bg);
      color: var(--input-text);
      border: 1.5px solid var(--input-border);
      border-radius: 12px;
      font-size: 17px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .search-input::placeholder { color: var(--input-placeholder); font-weight: 400; }
    .search-input:focus {
      outline: none;
      border-color: #1ec77b;
      box-shadow: 0 0 0 4px rgba(30, 199, 123, 0.15);
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
      position: relative;
      display: flex; gap: 14px; align-items: flex-start;
      padding: 16px 18px; margin-top: 16px;
      border-radius: 12px;
      border-left: 4px solid;
    }
    .search-result .material-icons { font-size: 28px; margin-top: 2px; }
    .search-result strong { display: block; font-size: 15px; margin-bottom: 4px; }
    .search-result strong { color: var(--heading); }
    .search-result p { margin: 0 0 8px; font-size: 13px; color: var(--pg-text); opacity: 0.85; }
    .search-result__close {
      position: absolute;
      top: 8px; right: 10px;
      background: transparent; border: none;
      font-size: 22px; line-height: 1;
      color: var(--pg-muted); cursor: pointer;
      padding: 4px 8px;
    }
    .search-result--available {
      background: linear-gradient(90deg, rgba(30, 199, 123, 0.1), rgba(30, 199, 123, 0.02));
      border-color: #1ec77b;
    }
    .search-result--available .material-icons { color: #0b8a4a; }
    .search-result--sold {
      background: linear-gradient(90deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.02));
      border-color: #ef4444;
    }
    .search-result--sold .material-icons { color: #b91c1c; }
    .search-result--reserved {
      background: linear-gradient(90deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.02));
      border-color: #f59e0b;
    }
    .search-result--reserved .material-icons { color: #b45309; }
    .search-result--assigned {
      background: linear-gradient(90deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.02));
      border-color: #3b82f6;
    }
    .search-result--assigned .material-icons { color: #1d4ed8; }
    .search-result--not_found {
      background: linear-gradient(90deg, rgba(107, 114, 128, 0.1), rgba(107, 114, 128, 0.02));
      border-color: #6b7280;
    }
    .search-result--not_found .material-icons { color: #4b5563; }

    /* ============ PICKER + GRID ============ */
    .picker__head {
      display: flex; justify-content: space-between; align-items: flex-start;
      flex-wrap: wrap; gap: 10px; margin-bottom: 20px;
    }
    .picker__head p { margin: 0; }
    .picker__legend { display: flex; gap: 8px; }
    .chip {
      padding: 5px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.03em;
    }
    .chip--free { background: #e5f7ee; color: #0b8a4a; border: 1px solid rgba(30, 199, 123, 0.35); }
    .chip--sel { background: #1ec77b; color: #fff; }

    .empty {
      text-align: center;
      padding: 40px 20px;
      color: var(--pg-muted);
    }
    .empty .big { font-size: 56px; color: #c9a96e; opacity: 0.6; margin-bottom: 12px; }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
      gap: 10px;
      margin-bottom: 20px;
    }
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
    .cell--pulse {
      animation: cell-pulse 1.4s ease-in-out 2;
    }
    @keyframes cell-pulse {
      0%,100% { transform: scale(1); box-shadow: 0 6px 16px rgba(30, 199, 123, 0.4); }
      50% { transform: scale(1.12); box-shadow: 0 10px 24px rgba(30, 199, 123, 0.6); }
    }

    .summary {
      display: flex; justify-content: space-between; align-items: center;
      padding: 20px 24px; margin-top: 20px;
      background: var(--summary-bg);
      border-radius: 14px;
      font-size: 15px;
      flex-wrap: wrap; gap: 14px;
      border: 1px solid var(--summary-border);
      color: var(--pg-text);
    }
    .summary__info strong { color: var(--heading); }

    .btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 12px 22px;
      border-radius: 10px;
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
      box-shadow: 0 4px 14px rgba(30, 199, 123, 0.3);
    }
    .btn.primary:hover:not(:disabled) {
      transform: translateY(-1px);
      filter: brightness(1.08);
      box-shadow: 0 8px 20px rgba(30, 199, 123, 0.45);
    }
    .btn.ghost {
      background: transparent;
      border-color: var(--input-border);
      color: var(--pg-text);
    }
    .btn.ghost:hover:not(:disabled) { background: rgba(127, 127, 127, 0.08); }
    .btn--lg { padding: 16px 28px; font-size: 15px; }
    .btn--sm { padding: 8px 14px; font-size: 13px; }
    .btn .material-icons { font-size: 18px; }

    /* ============ FOOTER ============ */
    .foot {
      text-align: center;
      color: var(--pg-muted);
      font-size: 12px;
      padding: 24px 0 8px;
    }
    .foot__brand {
      display: inline-flex; align-items: center; gap: 8px;
      font-weight: 800;
      color: var(--heading);
      margin-bottom: 4px;
    }
    .foot__dot {
      width: 8px; height: 8px; background: #1ec77b;
      border-radius: 50%;
      box-shadow: 0 0 0 4px rgba(30, 199, 123, 0.25);
    }
    .foot p { margin: 0; }

    /* ============ MODAL ============ */
    .modal {
      position: fixed; inset: 0;
      background: rgba(10, 14, 12, 0.65);
      backdrop-filter: blur(4px);
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
    .modal__close {
      position: absolute;
      top: 12px; right: 14px;
      background: transparent; border: none;
      font-size: 28px; line-height: 1;
      color: var(--pg-muted); cursor: pointer;
      padding: 4px 10px;
      border-radius: 8px;
    }
    .modal__close:hover { background: rgba(127,127,127,0.1); color: var(--heading); }
    .modal__card h2 { margin: 0 0 6px; font-size: 22px; color: var(--heading); }
    .modal__lead { margin: 0 0 8px; color: var(--pg-muted); font-size: 14px; }

    /* ============ FORMULARIO — legibilidad garantizada ============
       Problema anterior: en algunos navegadores el input heredaba estilos
       oscuros (color: white + background: dark) del contexto padre y el
       texto tipeado no se veía. Ahora forzamos !important para blindar
       el look en cualquier tema del navegador. */
    .form { display: grid; gap: 14px; margin-top: 20px; }
    .field { display: grid; gap: 6px; }
    .field span {
      font-weight: 700; letter-spacing: 0.02em;
      color: var(--pg-muted); text-transform: uppercase; font-size: 11px;
    }
    .field input {
      /* Colores por theme — variables + !important para blindar contra
         estilos oscuros que hereden del contexto padre (ej si el user
         viene desde el admin con --input-bg dark heredado). */
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
    .field input::placeholder {
      color: var(--input-placeholder) !important;
      opacity: 1;
    }
    .field input:focus {
      outline: none;
      border-color: #1ec77b;
      box-shadow: 0 0 0 4px rgba(30, 199, 123, 0.15);
    }
    /* Chrome autofill: usa un box-shadow del color del theme para evitar
       el amarillo default de Chrome. Referenciamos color-mix para el
       modo dark, con fallback al blanco. */
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

  /** Placeholder del buscador: un número de ejemplo con el ancho correcto. */
  searchPlaceholder = computed(() => {
    const r = this.overview();
    if (!r) return '2565';
    const example = Math.floor(r.total_tickets * 0.42) || 100;
    return String(example);
  });

  /** Nombre del premio mayor (primero por posición). */
  topPrizeName = computed(() => {
    const r = this.overview();
    if (!r?.prizes?.length) return '';
    return [...r.prizes].sort((a, b) => a.position - b.position)[0].name;
  });

  /** Heurística general: mapea el nombre del premio a un emoji visual. */
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
    if (/(mesa|silla|mueble)/.test(n)) return '🪑';
    return '🏆';
  }

  /** Emoji del premio mayor — solo se muestra si la rifa NO tiene logo_url. */
  heroPrizeEmoji = computed(() => {
    const name = this.topPrizeName();
    return name ? this.prizeEmoji(name) : '🏆';
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
      if (set.size >= 10) return;
      set.add(id);
    }
    this.selected.set(set);
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

  /** Cuando el usuario encuentra una boleta disponible y toca "Reservar". */
  selectFromSearch(ticketId: number) {
    // Agregar al set (respetando cap de 10)
    const set = new Set(this.selected());
    if (!set.has(ticketId) && set.size < 10) {
      set.add(ticketId);
      this.selected.set(set);
    }
    this.scrollToTicket(ticketId);
    // Si la boleta no estaba en el grid renderizado (por paginación futura),
    // igual la incluyo — el checkout la valida por ID en backend.
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
