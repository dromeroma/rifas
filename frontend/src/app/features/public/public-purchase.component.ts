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

        <!-- HERO PREMIUM: info + card del premio -->
        <header class="hero">
          <div class="hero__ornament hero__ornament--tl"></div>
          <div class="hero__ornament hero__ornament--br"></div>

          <div class="hero__grid">
            <div class="hero__info">
              <div class="badge">
                <span class="badge__dot"></span>
                <span>Rifa activa</span>
              </div>
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

            <!-- Card del premio (imagen o placeholder con emoji) -->
            <aside class="hero__prize">
              @if (r.logo_url) {
                <img [src]="r.logo_url" [alt]="r.name" class="hero__prize-img" />
              } @else if (heroPrizeEmoji(); as emoji) {
                <div class="hero__prize-fallback">
                  <div class="hero__prize-emoji">{{ emoji }}</div>
                  <div class="hero__prize-name">{{ topPrizeName() }}</div>
                </div>
              }
              <div class="hero__prize-ribbon">
                <span class="material-icons">emoji_events</span>
                Premio mayor
              </div>
            </aside>
          </div>
        </header>

        <!-- PREMIOS -->
        @if (r.prizes.length) {
          <section class="prizes">
            <h2><span class="section__icon">🏆</span> Premios</h2>
            <ul>
              @for (p of r.prizes; track p.position) {
                <li>
                  <span class="prize__pos">{{ p.position }}°</span>
                  <div class="prize__body">
                    <strong>{{ p.name }}</strong>
                    @if (p.draw_date) {
                      <small>sorteo · {{ formatDate(p.draw_date) }}</small>
                    }
                  </div>
                </li>
              }
            </ul>
          </section>
        }

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
    :host {
      display: block;
      background:
        radial-gradient(circle at 20% 0%, rgba(201, 169, 110, 0.25), transparent 40%),
        radial-gradient(circle at 80% 100%, rgba(30, 199, 123, 0.18), transparent 45%),
        linear-gradient(180deg, #faf6ee 0%, #f0e5c8 100%);
      min-height: 100vh;
      color: #1a2942;
      font-family: 'Inter', system-ui, sans-serif;
    }
    .page { max-width: 1080px; margin: 0 auto; padding: 24px 16px 60px; }

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

    /* ============ HERO PREMIUM ============ */
    .hero {
      position: relative;
      background:
        radial-gradient(circle at 100% 0%, rgba(201, 169, 110, 0.25), transparent 55%),
        linear-gradient(135deg, #0f1a2e 0%, #1a2942 40%, #2a3a5a 100%);
      color: #f8f1e3;
      border-radius: 24px;
      padding: 40px 32px;
      margin-bottom: 32px;
      box-shadow:
        0 30px 80px -20px rgba(15, 26, 46, 0.5),
        0 0 0 1px rgba(201, 169, 110, 0.15);
      overflow: hidden;
    }
    .hero__ornament {
      position: absolute;
      width: 240px; height: 240px;
      background: radial-gradient(circle, rgba(201, 169, 110, 0.35) 0%, transparent 65%);
      pointer-events: none;
    }
    .hero__ornament--tl { top: -60px; left: -60px; }
    .hero__ornament--br { bottom: -80px; right: -80px; background: radial-gradient(circle, rgba(30, 199, 123, 0.28) 0%, transparent 65%); }

    .hero__grid {
      position: relative;
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 32px;
      align-items: center;
    }
    @media (max-width: 720px) {
      .hero { padding: 28px 20px; border-radius: 20px; }
      .hero__grid { grid-template-columns: 1fr; gap: 24px; }
    }

    .badge {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 6px 14px;
      background: rgba(30, 199, 123, 0.18);
      color: #7fecb3;
      border: 1px solid rgba(30, 199, 123, 0.35);
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 18px;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .badge__dot {
      width: 8px; height: 8px;
      background: #1ec77b;
      border-radius: 50%;
      box-shadow: 0 0 0 4px rgba(30, 199, 123, 0.3);
      animation: badge-pulse 1.6s ease-in-out infinite;
    }
    @keyframes badge-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

    .hero h1 {
      margin: 0 0 12px;
      font-size: 34px;
      line-height: 1.1;
      color: #fff;
      font-weight: 800;
      letter-spacing: -0.01em;
    }
    @media (max-width: 720px) { .hero h1 { font-size: 26px; } }
    .hero__desc { margin: 0 0 20px; color: rgba(248, 241, 227, 0.85); font-size: 15px; line-height: 1.5; }

    .welcome {
      display: flex; gap: 12px; align-items: flex-start;
      padding: 14px 18px; margin: 16px 0 20px;
      background: rgba(201, 169, 110, 0.18);
      border-left: 3px solid #c9a96e;
      border-radius: 10px;
    }
    .welcome .material-icons { color: #c9a96e; }
    .welcome p { margin: 0; font-size: 14px; }

    .hero__stats { display: flex; gap: 20px; margin: 24px 0 16px; flex-wrap: wrap; }
    .stat { flex: 1; min-width: 100px; }
    .stat strong { display: block; font-size: 26px; color: #fff; font-weight: 800; }
    .stat small { color: rgba(248, 241, 227, 0.7); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }

    .progress {
      height: 10px;
      background: rgba(255,255,255,0.08);
      border-radius: 999px;
      overflow: hidden;
      box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
    }
    .progress__bar {
      height: 100%;
      background: linear-gradient(90deg, #1ec77b 0%, #c9a96e 100%);
      box-shadow: 0 0 12px rgba(30, 199, 123, 0.5);
      transition: width 0.6s ease;
      border-radius: 999px;
    }

    /* ============ Card del premio ============ */
    .hero__prize {
      position: relative;
      background: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%);
      border: 1px solid rgba(201, 169, 110, 0.3);
      border-radius: 20px;
      padding: 20px;
      min-height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .hero__prize-img {
      max-width: 100%;
      max-height: 240px;
      object-fit: contain;
      filter: drop-shadow(0 12px 24px rgba(0,0,0,0.3));
    }
    .hero__prize-fallback {
      text-align: center;
      color: rgba(248, 241, 227, 0.9);
    }
    .hero__prize-emoji {
      font-size: 92px;
      line-height: 1;
      margin-bottom: 12px;
      filter: drop-shadow(0 8px 16px rgba(0,0,0,0.4));
    }
    .hero__prize-name {
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 0.02em;
      color: #f8f1e3;
    }
    .hero__prize-ribbon {
      position: absolute;
      top: 12px; right: 12px;
      display: inline-flex; align-items: center; gap: 4px;
      padding: 5px 10px;
      background: linear-gradient(90deg, #c9a96e 0%, #e8c98a 100%);
      color: #1a2942;
      font-size: 11px;
      font-weight: 700;
      border-radius: 999px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      box-shadow: 0 4px 12px rgba(201, 169, 110, 0.5);
    }
    .hero__prize-ribbon .material-icons { font-size: 14px; }

    /* ============ SECCIONES ============ */
    .prizes, .search-card, .picker {
      background: #fff;
      border-radius: 20px;
      padding: 24px 28px;
      margin-bottom: 24px;
      box-shadow:
        0 4px 24px rgba(26, 41, 66, 0.06),
        0 0 0 1px rgba(201, 169, 110, 0.12);
    }
    @media (max-width: 720px) {
      .prizes, .search-card, .picker { padding: 20px; border-radius: 16px; }
    }

    .prizes h2, .search-card h2, .picker h2 {
      margin: 0 0 12px; font-size: 20px; font-weight: 700; color: #1a2942;
      display: inline-flex; align-items: center; gap: 8px;
    }
    .section__icon { font-size: 20px; }

    .prizes ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
    .prizes li {
      display: flex; gap: 14px; align-items: center;
      padding: 12px 14px;
      background: linear-gradient(90deg, rgba(201, 169, 110, 0.08) 0%, transparent 100%);
      border-radius: 10px;
      border-left: 3px solid #c9a96e;
    }
    .prize__pos {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 34px; height: 34px;
      background: linear-gradient(135deg, #c9a96e 0%, #e8c98a 100%);
      color: #1a2942;
      font-weight: 800;
      border-radius: 50%;
      font-size: 13px;
      box-shadow: 0 3px 8px rgba(201, 169, 110, 0.35);
    }
    .prize__body { display: flex; flex-direction: column; gap: 2px; }
    .prize__body strong { font-size: 15px; color: #1a2942; }
    .prize__body small { color: #6b7280; font-size: 12px; }

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
    .search-card__head p { margin: 0; color: #6b7280; font-size: 13px; }

    .search-form { display: flex; gap: 10px; flex-wrap: wrap; }
    .search-input {
      flex: 1;
      min-width: 160px;
      padding: 14px 18px;
      /* CRÍTICO: background y color explícitos para no heredar
         de las variables oscuras del admin en algún caso raro. */
      background: #ffffff !important;
      color: #1a2942 !important;
      border: 1.5px solid rgba(26, 41, 66, 0.15);
      border-radius: 12px;
      font-size: 17px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .search-input::placeholder { color: #9ca3af; font-weight: 400; }
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
    .search-result p { margin: 0 0 8px; font-size: 13px; color: #4b5563; }
    .search-result__close {
      position: absolute;
      top: 8px; right: 10px;
      background: transparent; border: none;
      font-size: 22px; line-height: 1;
      color: #6b7280; cursor: pointer;
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
      color: #6b7280;
    }
    .empty .big { font-size: 56px; color: #d1c4a3; margin-bottom: 12px; }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
      gap: 10px;
      margin-bottom: 20px;
    }
    .cell {
      padding: 14px 4px;
      background: linear-gradient(180deg, #fff 0%, #f8f1e3 100%);
      border: 1.5px solid rgba(26, 41, 66, 0.12);
      border-radius: 10px;
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      font-size: 15px;
      color: #1a2942;
      cursor: pointer;
      transition: all 0.15s;
      font-variant-numeric: tabular-nums;
      box-shadow: 0 1px 2px rgba(0,0,0,0.03);
    }
    .cell:hover {
      background: #fff;
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
      background: linear-gradient(90deg, #f8f1e3 0%, #f0e5c8 100%);
      border-radius: 14px;
      font-size: 15px;
      flex-wrap: wrap; gap: 14px;
      border: 1px solid rgba(201, 169, 110, 0.3);
    }
    .summary__info strong { color: #1a2942; }

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
      border-color: rgba(26, 41, 66, 0.2);
      color: #1a2942;
    }
    .btn.ghost:hover:not(:disabled) { background: rgba(26, 41, 66, 0.05); }
    .btn--lg { padding: 16px 28px; font-size: 15px; }
    .btn--sm { padding: 8px 14px; font-size: 13px; }
    .btn .material-icons { font-size: 18px; }

    /* ============ FOOTER ============ */
    .foot {
      text-align: center;
      color: rgba(26, 41, 66, 0.65);
      font-size: 12px;
      padding: 24px 0 8px;
    }
    .foot__brand {
      display: inline-flex; align-items: center; gap: 8px;
      font-weight: 800;
      color: #1a2942;
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
      background: #fff;
      border-radius: 20px;
      padding: 32px 28px;
      max-width: 460px;
      width: 100%;
      max-height: 92vh;
      overflow-y: auto;
      box-shadow: 0 25px 70px rgba(0,0,0,0.35);
      border: 1px solid rgba(201, 169, 110, 0.2);
    }
    .modal__close {
      position: absolute;
      top: 12px; right: 14px;
      background: transparent; border: none;
      font-size: 28px; line-height: 1;
      color: #6b7280; cursor: pointer;
      padding: 4px 10px;
      border-radius: 8px;
    }
    .modal__close:hover { background: rgba(0,0,0,0.05); color: #1a2942; }
    .modal__card h2 { margin: 0 0 6px; font-size: 22px; color: #1a2942; }
    .modal__lead { margin: 0 0 8px; color: #4b5563; font-size: 14px; }

    /* ============ FORMULARIO — legibilidad garantizada ============
       Problema anterior: en algunos navegadores el input heredaba estilos
       oscuros (color: white + background: dark) del contexto padre y el
       texto tipeado no se veía. Ahora forzamos !important para blindar
       el look en cualquier tema del navegador. */
    .form { display: grid; gap: 14px; margin-top: 20px; }
    .field { display: grid; gap: 6px; }
    .field span {
      font-weight: 700; letter-spacing: 0.02em;
      color: #4b5563; text-transform: uppercase; font-size: 11px;
    }
    .field input {
      /* Colores forzados — inputs claros, letra oscura */
      background: #ffffff !important;
      color: #1a2942 !important;
      padding: 14px 16px;
      border: 1.5px solid rgba(26, 41, 66, 0.15);
      border-radius: 10px;
      font-size: 15px;
      font-family: inherit;
      transition: border-color 0.15s, box-shadow 0.15s;
      -webkit-text-fill-color: #1a2942;  /* iOS Safari override */
    }
    .field input::placeholder {
      color: #9ca3af !important;
      opacity: 1;
    }
    .field input:focus {
      outline: none;
      border-color: #1ec77b;
      box-shadow: 0 0 0 4px rgba(30, 199, 123, 0.15);
    }
    /* Chrome autofill: quita el fondo amarillo/dark y respeta nuestra paleta */
    .field input:-webkit-autofill,
    .field input:-webkit-autofill:hover,
    .field input:-webkit-autofill:focus {
      -webkit-box-shadow: 0 0 0 40px #ffffff inset !important;
      -webkit-text-fill-color: #1a2942 !important;
      caret-color: #1a2942;
    }

    .or { text-align: center; margin: 6px 0; color: #6b7280; font-size: 12px; }
    .muted { color: #6b7280; font-size: 13px; margin: 4px 0 0; }

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

  /** Emoji del premio mayor — heurística por keywords. Solo se muestra si
   *  la rifa NO tiene logo_url configurado. */
  heroPrizeEmoji = computed(() => {
    const name = this.topPrizeName().toLowerCase();
    if (!name) return null;
    if (/(televisor|tele|tv|pantalla|smart tv)/.test(name)) return '📺';
    if (/(moto|scooter|motocicleta)/.test(name)) return '🏍️';
    if (/(carro|auto|vehículo|camioneta)/.test(name)) return '🚗';
    if (/(celular|iphone|samsung|smartphone|teléfono)/.test(name)) return '📱';
    if (/(nevera|refrigerador)/.test(name)) return '🧊';
    if (/(lavadora)/.test(name)) return '🧺';
    if (/(bono|efectivo|dinero|plata|premio)/.test(name)) return '💰';
    if (/(portátil|computador|laptop|pc)/.test(name)) return '💻';
    if (/(bicicleta|bici)/.test(name)) return '🚴';
    if (/(mercado|canasta)/.test(name)) return '🛒';
    return '🏆';
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
