import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, input, signal } from '@angular/core';

interface PrizeBrief {
  position: number;
  name: string;
  draw_date: string;
  estimated_value: number | null;
}

interface PrintTicket {
  ticket_id: number;
  number_label: string;
  code: string;
  short_code: string;
  numbers: string[];
  printed_at: string | null;
}

export interface PrintData {
  raffle_id: number;
  raffle_name: string;
  ticket_price: number;
  final_draw_date: string;
  primary_color: string | null;
  logo_url: string | null;
  lottery_name: string | null;
  responsible_name: string | null;
  responsible_phone: string | null;
  seller_id: number;
  seller_name: string;
  seller_phone: string | null;
  prizes: PrizeBrief[];
  tickets: PrintTicket[];
}

interface RenderedTicket extends PrintTicket {
  qrAdmin: string;       // dataURL — QR para el desprendible (atajo admin)
  qrPromo: string;       // dataURL — QR para la boleta (promo + verify)
}

/**
 * Hoja carta imprimible con boletas físicas (2x2 = 4 boletas por hoja).
 *
 * Cada boleta tiene:
 *  - Desprendible (talón vendedor) arriba con QR admin + datos del cliente
 *  - Boleta principal abajo con números, premios, QR promo
 *  - Línea de corte central con tijera
 *
 * @media print: márgenes 0, fondos limpios, sin chrome de la app.
 */
export type PrintDesign = 'soccer' | 'professional';

@Component({
  selector: 'app-ticket-print-sheet',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="print-host">
      @if (loading()) {
        <div class="loading">Preparando boletas...</div>
      } @else {
        @for (page of pages(); track $index) {
          <section class="page" [class.page--six]="boletasPerPage() === 6">
            <header class="page-header">
              <div class="brand">
                <span class="dot"></span>
                <strong>Boletera</strong>
                <span class="muted">· {{ data().raffle_name }}</span>
              </div>
              <div class="page-meta">
                <span>Vendedor: <strong>{{ data().seller_name }}</strong></span>
                <span>Hoja {{ $index + 1 }} de {{ pages().length }}</span>
              </div>
            </header>

            <div class="grid">
              @for (t of page; track t.ticket_id) {
                <article class="boleta">
                  <!-- TALÓN VENDEDOR — 2 campos (Nombre + Celular) con más
                       aire y tipografía más elegante. Aplica a ambos diseños
                       (cancha y profesional). -->
                  <div class="talon">
                    <div class="talon-head">
                      <div>
                        <div class="talon-eyebrow">Talón vendedor</div>
                        <div class="big-label">{{ formatLabel(t.number_label) }}</div>
                        <div class="short-code">Cód: <strong>{{ t.short_code }}</strong></div>
                      </div>
                      <img class="qr" [src]="t.qrAdmin" alt="Escanea para verificar la boleta" />
                    </div>
                    <div class="lines lines--two">
                      <div class="line"><span>Nombre del cliente:</span></div>
                      <div class="line"><span>Celular:</span></div>
                    </div>
                  </div>

                  <!-- LÍNEA DE CORTE -->
                  <div class="cut">
                    <span class="scissor" aria-hidden="true">✂</span>
                  </div>

                  <!-- BOLETA CLIENTE — diseño según printDesign() -->
                  <div class="ticket" [class.ticket--pro]="printDesign() === 'professional'">

                    @if (printDesign() === 'professional') {
                      <!-- ========== DISEÑO PROFESIONAL ========== -->
                      <header class="pro-head">
                        <div class="pro-head__brand">
                          <div class="pro-head__eyebrow">★ GRAN RIFA ★</div>
                          <div class="pro-head__name">{{ data().raffle_name }}</div>
                        </div>
                        <div class="pro-head__label">
                          <small>BOLETA</small>
                          <strong>{{ t.number_label }}</strong>
                        </div>
                      </header>

                      <div class="pro-body">
                        <!-- TV fotorrealista (SVG propio, sin foto real
                             para evitar problemas de copyright). Bezel con
                             reflejos, estadio con tribunas y luces, jugador
                             con uniforme, balón, sombra de soporte. -->
                        <div class="pro-tv">
                          <svg viewBox="0 0 200 130" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
                            <defs>
                              <!-- Bezel exterior: gradiente para look metálico -->
                              <linearGradient [attr.id]="'bzl-' + t.ticket_id" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stop-color="#2a2a2a" />
                                <stop offset="50%" stop-color="#0a0a0a" />
                                <stop offset="100%" stop-color="#1a1a1a" />
                              </linearGradient>
                              <!-- Cielo de estadio nocturno -->
                              <linearGradient [attr.id]="'sky-' + t.ticket_id" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stop-color="#2a4a78" />
                                <stop offset="50%" stop-color="#1a2a4a" />
                                <stop offset="100%" stop-color="#0d1b2a" />
                              </linearGradient>
                              <!-- Reflejo glass del bezel -->
                              <linearGradient [attr.id]="'sheen-' + t.ticket_id" x1="0" x2="1" y1="0" y2="0">
                                <stop offset="0%" stop-color="rgba(255,255,255,0)" />
                                <stop offset="50%" stop-color="rgba(255,255,255,0.12)" />
                                <stop offset="100%" stop-color="rgba(255,255,255,0)" />
                              </linearGradient>
                              <!-- Halo cálido de las luces del estadio -->
                              <radialGradient [attr.id]="'haze-' + t.ticket_id" cx="50%" cy="20%" r="70%">
                                <stop offset="0%" stop-color="rgba(255,220,150,0.32)" />
                                <stop offset="100%" stop-color="rgba(255,220,150,0)" />
                              </radialGradient>
                              <!-- Gradiente césped -->
                              <linearGradient [attr.id]="'grass-' + t.ticket_id" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stop-color="#4ca25a" />
                                <stop offset="100%" stop-color="#2d6b3a" />
                              </linearGradient>
                              <!-- Sombra realista bajo el TV -->
                              <radialGradient [attr.id]="'tvShadow-' + t.ticket_id" cx="50%" cy="50%" r="50%">
                                <stop offset="0%" stop-color="rgba(0,0,0,0.4)" />
                                <stop offset="100%" stop-color="rgba(0,0,0,0)" />
                              </radialGradient>
                            </defs>

                            <!-- Sombra base bajo el TV -->
                            <ellipse cx="100" cy="124" rx="80" ry="3"
                                     [attr.fill]="'url(#tvShadow-' + t.ticket_id + ')'" />

                            <!-- BEZEL exterior (marco del TV) -->
                            <rect x="2" y="2" width="196" height="110" rx="4"
                                  [attr.fill]="'url(#bzl-' + t.ticket_id + ')'" />
                            <!-- Borde interno fino -->
                            <rect x="5" y="5" width="190" height="104" rx="2"
                                  fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="0.5" />

                            <!-- PANTALLA -->
                            <rect x="6" y="6" width="188" height="102" rx="2"
                                  [attr.fill]="'url(#sky-' + t.ticket_id + ')'" />

                            <!-- Tribunas curvas del estadio (silueta oscura) -->
                            <path d="M 6 6 Q 100 38 194 6 L 194 48 Q 100 60 6 48 Z"
                                  fill="rgba(0,0,0,0.55)" />
                            <!-- Detalle de gradas (líneas horizontales sutiles) -->
                            <g stroke="rgba(255,255,255,0.06)" stroke-width="0.3">
                              <line x1="6" y1="22" x2="194" y2="22" />
                              <line x1="6" y1="30" x2="194" y2="30" />
                              <line x1="6" y1="38" x2="194" y2="38" />
                            </g>

                            <!-- Estructura del estadio (techo arqueado a los lados) -->
                            <path d="M 6 6 L 6 16 Q 30 4 60 8 L 60 6 Z"
                                  fill="rgba(0,0,0,0.65)" />
                            <path d="M 194 6 L 194 16 Q 170 4 140 8 L 140 6 Z"
                                  fill="rgba(0,0,0,0.65)" />

                            <!-- Luces del estadio (reflectores) -->
                            <g fill="rgba(255,240,180,0.95)">
                              <circle cx="30" cy="14" r="0.9" />
                              <circle cx="60" cy="10" r="0.7" />
                              <circle cx="90" cy="9" r="1" />
                              <circle cx="110" cy="9" r="1" />
                              <circle cx="140" cy="10" r="0.7" />
                              <circle cx="170" cy="14" r="0.9" />
                            </g>
                            <!-- Halo cálido sobre las luces -->
                            <rect x="6" y="6" width="188" height="50"
                                  [attr.fill]="'url(#haze-' + t.ticket_id + ')'" />

                            <!-- Pequeños puntos de público en gradas -->
                            <g fill="rgba(255,150,80,0.35)">
                              <circle cx="20" cy="32" r="0.3" />
                              <circle cx="40" cy="36" r="0.3" />
                              <circle cx="70" cy="38" r="0.3" />
                              <circle cx="130" cy="38" r="0.3" />
                              <circle cx="160" cy="36" r="0.3" />
                              <circle cx="180" cy="32" r="0.3" />
                            </g>

                            <!-- CANCHA verde con perspectiva -->
                            <rect x="6" y="60" width="188" height="48"
                                  [attr.fill]="'url(#grass-' + t.ticket_id + ')'" />
                            <!-- Líneas de cancha en perspectiva sutil -->
                            <g stroke="rgba(255,255,255,0.4)" stroke-width="0.4" fill="none">
                              <line x1="100" y1="60" x2="100" y2="108" />
                              <circle cx="100" cy="84" r="9" />
                              <line x1="6" y1="84" x2="194" y2="84" />
                            </g>
                            <!-- Brillo sutil del césped -->
                            <ellipse cx="100" cy="100" rx="80" ry="10"
                                     fill="rgba(255,255,255,0.06)" />

                            <!-- JUGADOR pateando (silueta detallada) -->
                            <g>
                              <!-- Sombra del jugador en el césped -->
                              <ellipse cx="96" cy="98" rx="9" ry="1.6" fill="rgba(0,0,0,0.4)" />
                              <!-- Cabeza con cabello -->
                              <circle cx="95" cy="55" r="2.6" fill="#3a2818" />
                              <circle cx="95" cy="55.5" r="2.3" fill="#cba07a" />
                              <!-- Cuello -->
                              <rect x="94" y="57.5" width="2" height="1.2" fill="#cba07a" />
                              <!-- Camiseta amarilla -->
                              <path d="M 90 59
                                       Q 89 65 90 72
                                       L 100 72
                                       Q 101 65 100 59
                                       Q 97 58 95 58
                                       Q 93 58 90 59 Z"
                                    fill="#f5c842" />
                              <!-- Brazos -->
                              <path d="M 90 60 Q 86 64 84 70" stroke="#cba07a"
                                    stroke-width="1.4" fill="none" stroke-linecap="round" />
                              <path d="M 100 60 Q 105 62 107 65" stroke="#cba07a"
                                    stroke-width="1.4" fill="none" stroke-linecap="round" />
                              <!-- Short azul -->
                              <path d="M 90 72 L 100 72 L 101 79 L 89 79 Z"
                                    fill="#1e3a78" />
                              <!-- Pierna de apoyo (izquierda) -->
                              <path d="M 91 79 Q 91 88 90 94 L 93 94 Q 94 88 94 79 Z"
                                    fill="#cba07a" />
                              <!-- Media roja pierna apoyo -->
                              <rect x="89.5" y="93" width="4" height="3" fill="#c62828" />
                              <!-- Bota -->
                              <ellipse cx="91.5" cy="97" rx="2.5" ry="1.2" fill="#1a1a1a" />
                              <!-- Pierna pateando (derecha extendida) -->
                              <path d="M 98 79 Q 102 82 107 84 L 109 86 Q 105 86 99 83 Z"
                                    fill="#cba07a" />
                              <rect x="106" y="83" width="4" height="2.5"
                                    fill="#c62828" transform="rotate(20, 108, 84)" />
                              <ellipse cx="111" cy="86" rx="2.5" ry="1.2"
                                       fill="#1a1a1a" transform="rotate(20, 111, 86)" />
                            </g>

                            <!-- BALÓN clásico (blanco y negro) -->
                            <g>
                              <ellipse cx="115" cy="90" rx="3" ry="1" fill="rgba(0,0,0,0.5)" />
                              <circle cx="115" cy="87" r="2.6" fill="#ffffff"
                                      stroke="#1a1a1a" stroke-width="0.4" />
                              <!-- Pentágonos negros del balón -->
                              <polygon points="115,86 116.3,86.6 115.8,88 114.2,88 113.7,86.6"
                                       fill="#1a1a1a" />
                            </g>

                            <!-- TEXTO "50"" en blanco grande, esquina izquierda -->
                            <text x="14" y="76" font-family="Inter, Arial, sans-serif"
                                  font-weight="900" font-size="22"
                                  fill="rgba(255,255,255,0.97)" letter-spacing="-1.5">50&quot;</text>

                            <!-- TEXTO "4K HDR" + "ULTRA HD" esquina derecha -->
                            <text x="188" y="72" text-anchor="end"
                                  font-family="Inter, Arial, sans-serif"
                                  font-weight="900" font-size="12"
                                  fill="rgba(255,255,255,0.97)" letter-spacing="-0.5">4K HDR</text>
                            <text x="188" y="80" text-anchor="end"
                                  font-family="Inter, Arial, sans-serif"
                                  font-weight="700" font-size="5.5"
                                  fill="rgba(255,255,255,0.85)" letter-spacing="1">ULTRA HD</text>

                            <!-- Reflejo glass sutil sobre la pantalla -->
                            <rect x="6" y="6" width="188" height="102" rx="2"
                                  [attr.fill]="'url(#sheen-' + t.ticket_id + ')'" opacity="0.6" />

                            <!-- LED indicador inferior centrado -->
                            <circle cx="100" cy="110.5" r="0.5" fill="rgba(220,180,80,0.6)" />

                            <!-- SOPORTE central -->
                            <rect x="94" y="112" width="12" height="4" fill="#0a0a0a" />
                            <!-- Patas anchas en V (estilo TV moderno) -->
                            <polygon points="60,120 100,114 140,120 130,122 100,116 70,122"
                                     fill="#1a1a1a" />
                            <polygon points="60,120 70,122 65,123 58,121"
                                     fill="#0a0a0a" />
                            <polygon points="140,120 130,122 135,123 142,121"
                                     fill="#0a0a0a" />
                          </svg>
                          <div class="pro-tv__caption">TELEVISOR <strong>50"</strong> · 4K ULTRA HD</div>
                        </div>

                        <!-- Lado derecho: 20 números en grilla 5x4 -->
                        <div class="pro-numbers">
                          <div class="pro-numbers__title">TUS NÚMEROS</div>
                          <div class="pro-numbers__grid">
                            @for (n of t.numbers; track $index) {
                              <span class="pro-num">{{ n }}</span>
                            }
                          </div>
                        </div>
                      </div>

                      <!-- Info: premios -->
                      <div class="pro-prizes">
                        @for (p of data().prizes; track p.position) {
                          <div class="pro-prize" [class.pro-prize--main]="p.position === 1">
                            <span class="pro-prize__dot">{{ p.position === 1 ? '★' : '•' }}</span>
                            <span class="pro-prize__name">{{ p.name }}</span>
                            <span class="pro-prize__date">{{ formatShortDate(p.draw_date) }}</span>
                          </div>
                        }
                      </div>

                      <!-- Footer: QR + info estructurada en filas + valor -->
                      <footer class="pro-foot">
                        <div class="pro-foot__qr-box">
                          <img class="pro-foot__qr" [src]="t.qrPromo" alt="Verifica tu boleta en línea" />
                          <small class="pro-foot__qr-caption">Verifica en línea</small>
                        </div>
                        <div class="pro-foot__info">
                          @if (data().lottery_name) {
                            <div class="pro-foot__row">
                              <span class="pro-foot__label">Juega con</span>
                              <span class="pro-foot__value">{{ data().lottery_name }}</span>
                            </div>
                          }
                          @if (data().responsible_name) {
                            <div class="pro-foot__row">
                              <span class="pro-foot__label">Responsable</span>
                              <span class="pro-foot__value">
                                {{ data().responsible_name }}@if (data().responsible_phone) { · {{ data().responsible_phone }} }
                              </span>
                            </div>
                          }
                          <div class="pro-foot__row">
                            <span class="pro-foot__label">Sorteo final</span>
                            <span class="pro-foot__value pro-foot__value--em">{{ formatDate(data().final_draw_date) }}</span>
                          </div>
                          <div class="pro-foot__row pro-foot__row--code">
                            <span class="pro-foot__label">Código</span>
                            <span class="pro-foot__value pro-foot__value--mono">{{ t.short_code }}</span>
                          </div>
                        </div>
                        <div class="pro-foot__price">
                          <small>VALOR</small>
                          <strong>{{ '$' + fmt(data().ticket_price) }}</strong>
                        </div>
                      </footer>

                      <!-- Watermark "RIFA OFICIAL" -->
                      <div class="pro-watermark" aria-hidden="true">RIFA OFICIAL</div>

                    } @else {
                      <!-- ========== DISEÑO SOCCER (default) ========== -->
                      <header class="ticket-head">
                        <div>
                          <div class="ticket-eyebrow">Boleta</div>
                          <div class="ticket-label">{{ formatLabel(t.number_label) }}</div>
                        </div>
                        <img class="qr small" [src]="t.qrPromo" alt="Escanea para verificar tu boleta en línea" />
                      </header>

                      <div class="raffle-name">
                        <span class="raffle-name__txt">{{ data().raffle_name }}</span>
                        <span class="raffle-name__price">{{ '$' + fmt(data().ticket_price) }}</span>
                      </div>

                      <div class="field" aria-label="Cancha con los 20 números">
                        <svg class="field__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                          <rect x="2" y="2" width="96" height="96" fill="none"
                                stroke="rgba(255,255,255,0.9)" stroke-width="0.6" />
                          <line x1="2" y1="50" x2="98" y2="50"
                                stroke="rgba(255,255,255,0.9)" stroke-width="0.5" />
                          <circle cx="50" cy="50" r="8" fill="none"
                                  stroke="rgba(255,255,255,0.9)" stroke-width="0.5" />
                          <circle cx="50" cy="50" r="0.9" fill="rgba(255,255,255,1)" />
                          <rect x="25" y="2" width="50" height="10" fill="none"
                                stroke="rgba(255,255,255,0.9)" stroke-width="0.5" />
                          <rect x="25" y="88" width="50" height="10" fill="none"
                                stroke="rgba(255,255,255,0.9)" stroke-width="0.5" />
                          <rect x="38" y="2" width="24" height="4" fill="none"
                                stroke="rgba(255,255,255,0.9)" stroke-width="0.4" />
                          <rect x="38" y="94" width="24" height="4" fill="none"
                                stroke="rgba(255,255,255,0.9)" stroke-width="0.4" />
                        </svg>
                        @for (p of positionedFor(t.numbers); track $index) {
                          <div class="player" [style.left.%]="p.x" [style.top.%]="p.y">
                            <span class="player__chip">{{ p.number }}</span>
                          </div>
                        }
                      </div>

                      <div class="info">
                        <div class="info-row">
                          <span class="info-label">Sorteo final:</span>
                          <strong>{{ formatDate(data().final_draw_date) }}</strong>
                        </div>
                        @if (data().lottery_name) {
                          <div class="info-row">
                            <span class="info-label">Lotería:</span>
                            <strong>{{ data().lottery_name }}</strong>
                          </div>
                        }
                        @if (data().prizes.length) {
                          <div class="prizes">
                            <div class="info-label">Premios:</div>
                            @for (p of data().prizes; track p.position) {
                              <div class="prize-row">
                                <span>{{ p.position }}. {{ p.name }}</span>
                                <span class="muted">{{ formatDate(p.draw_date) }}</span>
                              </div>
                            }
                          </div>
                        }
                        @if (data().responsible_name) {
                          <div class="info-row resp">
                            <span class="info-label">Responsable:</span>
                            <strong>{{ data().responsible_name }}</strong>
                            @if (data().responsible_phone) {
                              <span> · {{ data().responsible_phone }}</span>
                            }
                          </div>
                        }
                        <div class="verify">Verifica en línea escaneando el QR</div>
                      </div>

                      <div class="watermark" aria-hidden="true">{{ data().raffle_name }}</div>
                    }
                  </div>
                </article>
              }
            </div>
          </section>
        }
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      background: #e5e7eb;
      padding: 1.5rem;
      min-height: 100vh;
    }
    .loading {
      text-align: center;
      padding: 4rem 1rem;
      color: #6b7280;
    }
    .print-host { display: flex; flex-direction: column; align-items: center; gap: 1.5rem; }

    /* === Hoja carta (8.5in x 11in) === */
    .page {
      width: 8.5in;
      min-height: 11in;
      background: #fff;
      box-shadow: 0 4px 24px rgba(0,0,0,0.12);
      padding: 0.4in 0.35in;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      page-break-after: always;
      break-after: page;
    }
    .page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9pt;
      color: #4b5563;
      padding-bottom: 0.15in;
      border-bottom: 1px dashed #d1d5db;
      margin-bottom: 0.18in;
    }
    .brand { display: flex; align-items: center; gap: 0.4em; }
    .brand .dot {
      display: inline-block;
      width: 0.5em; height: 0.5em;
      background: #1ec77b;
      border-radius: 50%;
    }
    .muted { color: #9ca3af; }
    .page-meta { display: flex; gap: 1em; }

    /* === Grilla 2x2 (4 boletas por hoja, default) === */
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 0.18in;
      flex: 1;
    }
    /* Variante 6 boletas por hoja: 3 cols x 2 filas. Mantiene la misma
       altura por boleta que el modo 4 (orientación vertical: talón arriba,
       cancha abajo), pero las boletas son más angostas — por eso solo
       achicamos el ancho de chips y QRs, no la altura del layout. */
    .page--six .grid {
      grid-template-columns: 1fr 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 0.14in;
    }
    /* Padding lateral reducido y elementos horizontales más pequeños */
    .page--six .talon { padding: 0.1in 0.09in; }
    .page--six .talon .big-label { font-size: 17pt; }
    .page--six .talon .short-code { font-size: 7pt; }
    .page--six .talon .qr { width: 0.6in; height: 0.6in; }
    .page--six .talon .lines { gap: 0.05in; }
    .page--six .talon .line span { font-size: 7pt; }

    .page--six .ticket { padding: 0.1in 0.09in; }
    .page--six .ticket-label { font-size: 14pt; }
    .page--six .ticket .qr.small { width: 0.5in; height: 0.5in; }
    .page--six .raffle-name { font-size: 8.5pt; }
    .page--six .raffle-name__price { font-size: 7.5pt; padding: 1pt 5pt; }
    .page--six .player__chip {
      min-width: 0.3in;
      height: 0.22in;
      padding: 0 4px;
      font-size: 8.5pt;
      border-width: 1.2px;
    }
    .page--six .info { font-size: 7pt; }
    .page--six .info-label { font-size: 6pt; }
    .page--six .prize-row { font-size: 6.5pt; }
    .page--six .watermark { font-size: 14pt; }
    .page--six .page-meta { font-size: 8pt; }

    /* === Boleta individual === */
    .boleta {
      position: relative;
      border: 1px dashed #000;
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #fff;
      min-height: 0;
    }

    /* === Talón (vendedor) === */
    .talon {
      padding: 0.12in 0.14in;
      background: linear-gradient(180deg, #f9fafb 0%, #fff 100%);
      flex: 0 0 30%;
      display: flex;
      flex-direction: column;
      gap: 0.06in;
    }
    .talon-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .talon-eyebrow {
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #6b7280;
    }
    .big-label {
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 22pt;
      font-weight: 900;
      line-height: 1;
      color: #0a0e0c;
      margin-top: 0.04in;
    }
    .short-code {
      font-size: 8pt;
      color: #4b5563;
      margin-top: 0.04in;
    }
    .short-code strong {
      font-family: 'Courier New', monospace;
      letter-spacing: 0.12em;
      color: #0a0e0c;
    }
    .qr {
      width: 0.85in;
      height: 0.85in;
      object-fit: contain;
      image-rendering: pixelated;
    }
    .qr.small { width: 0.7in; height: 0.7in; }
    .lines {
      display: flex;
      flex-direction: column;
      gap: 0.06in;
      margin-top: 0.04in;
    }
    .line {
      display: flex;
      align-items: flex-end;
      gap: 0.4em;
      border-bottom: 1px solid #1f2937;
      padding-bottom: 1pt;
      height: 13pt;
    }
    .line span {
      font-size: 7.5pt;
      color: #6b7280;
      font-weight: 600;
    }

    /* Variante de 2 campos (Nombre + Celular): líneas más altas, label
       en estilo elegante con punto dorado de marca, más aire vertical. */
    .lines--two {
      gap: 0.12in;
      margin-top: 0.08in;
    }
    .lines--two .line {
      height: 18pt;
      border-bottom: 1.2px solid #0d1b2a;
      padding-bottom: 2pt;
      position: relative;
    }
    .lines--two .line span {
      font-size: 7pt;
      font-weight: 700;
      color: #6e4a14;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    /* Pequeño punto dorado al inicio de cada línea, toque elegante */
    .lines--two .line::before {
      content: '';
      position: absolute;
      left: -3pt;
      bottom: 4pt;
      width: 3pt;
      height: 3pt;
      background: #c9a961;
      border-radius: 50%;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    .page--six .talon .lines--two { gap: 0.08in; margin-top: 0.06in; }
    .page--six .talon .lines--two .line { height: 14pt; }
    .page--six .talon .lines--two .line span { font-size: 6.5pt; }

    /* === Línea de corte === */
    .cut {
      position: relative;
      height: 0;
      border-top: 1.2px dashed #1f2937;
      margin: 0;
    }
    .cut .scissor {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      background: #fff;
      padding: 0 4px;
      font-size: 9pt;
      color: #1f2937;
    }

    /* === Boleta cliente === */
    .ticket {
      position: relative;
      flex: 1;
      padding: 0.12in 0.14in;
      display: flex;
      flex-direction: column;
      gap: 0.06in;
      background:
        radial-gradient(circle at 50% 50%, rgba(30, 199, 123, 0.06), transparent 60%),
        #fff;
    }
    .ticket-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .ticket-eyebrow {
      font-size: 7pt;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #1ec77b;
    }
    .ticket-label {
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 18pt;
      font-weight: 900;
      line-height: 1;
      color: #0a0e0c;
      margin-top: 0.02in;
    }
    .raffle-name {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      font-size: 10pt;
      font-weight: 700;
      color: #0a0e0c;
      padding: 0.04in 0;
      border-top: 1px solid #e5e7eb;
      border-bottom: 1px solid #e5e7eb;
    }
    .raffle-name__txt {
      flex: 1;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* Chip del valor de la boleta — texto negro grueso sobre fondo blanco
       con borde verde fuerte. Se ve nítido en B&W (negro + contraste alto)
       y en color (acento verde de marca). El dorado anterior se imprimía
       opaco. */
    .raffle-name__price {
      flex-shrink: 0;
      padding: 1.5pt 7pt;
      background: #ffffff;
      color: #0a0e0c;
      border: 1.5px solid #0b8a4a;
      border-radius: 999px;
      font-size: 9.5pt;
      font-weight: 900;
      letter-spacing: 0.02em;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    /* === Cancha (campo de fútbol) === */
    /* Verde medio: más vivo que el pastel anterior pero más suave que el
       saturado original. En color se lee bien como cancha; en B&W sale
       como un gris medio que permite a los chips destacar. */
    .field {
      position: relative;
      flex: 1;
      aspect-ratio: 2 / 3;
      min-height: 1.4in;
      max-height: 2.1in;
      background:
        repeating-linear-gradient(
          to bottom,
          #7fc592 0,
          #7fc592 5%,
          #6db581 5%,
          #6db581 10%
        );
      border-top: 2px solid #0b3d91;
      border-bottom: 2px solid #0b3d91;
      overflow: hidden;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    .field__lines {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .player {
      position: absolute;
      transform: translate(-50%, -50%);
    }
    .player__chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 0.38in;
      height: 0.26in;
      padding: 0 6px;
      background: #ffffff;
      color: #0b3d91;
      border: 1.4px solid #0b3d91;
      border-radius: 999px;
      font-family: 'Inter', system-ui, sans-serif;
      font-weight: 700;
      font-size: 10pt;
      letter-spacing: 0.02em;
      font-variant-numeric: tabular-nums;
      box-shadow: 0 1px 2px rgba(0,0,0,0.25);
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    /* === Info de premios y responsable === */
    .info {
      font-size: 7.5pt;
      color: #1f2937;
      display: flex;
      flex-direction: column;
      gap: 0.03in;
    }
    .info-row {
      display: flex;
      gap: 0.4em;
      align-items: baseline;
    }
    .info-label {
      font-weight: 700;
      color: #6b7280;
      text-transform: uppercase;
      font-size: 6.5pt;
      letter-spacing: 0.08em;
    }
    .prizes {
      display: flex;
      flex-direction: column;
      gap: 1pt;
      padding-top: 0.02in;
      border-top: 1px dotted #d1d5db;
    }
    .prize-row {
      display: flex;
      justify-content: space-between;
      gap: 0.5em;
      font-size: 7pt;
    }
    .resp { padding-top: 0.02in; border-top: 1px dotted #d1d5db; }
    .verify {
      font-size: 6.5pt;
      text-align: center;
      color: #6b7280;
      font-style: italic;
      padding-top: 0.04in;
    }

    /* === Watermark === */
    .watermark {
      position: absolute;
      bottom: 0.3in;
      left: 50%;
      transform: translateX(-50%) rotate(-12deg);
      font-size: 20pt;
      font-weight: 900;
      color: rgba(30, 199, 123, 0.06);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      pointer-events: none;
      white-space: nowrap;
      max-width: 90%;
      overflow: hidden;
    }

    /* ============================================================
       DISEÑO PROFESIONAL PREMIUM — boleta clásica de rifa, elegante
       Paleta: midnight navy #0d1b2a + champagne gold #c9a961 +
       ivory/cream #faf4e3 + burgundy accent #722f37 para detalles
       ============================================================ */
    .ticket--pro {
      background: #faf4e3;
      position: relative;
      padding: 0 !important;
      gap: 0 !important;
      overflow: hidden;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    /* Doble borde dorado interno (clásico premium) */
    .ticket--pro::after {
      content: '';
      position: absolute;
      inset: 4pt;
      border: 0.5px solid rgba(201, 169, 97, 0.55);
      border-radius: 2pt;
      pointer-events: none;
      z-index: 5;
    }

    /* === Header oscuro === */
    .ticket--pro .pro-head {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 8pt;
      padding: 0.1in 0.14in;
      background:
        linear-gradient(135deg, #0d1b2a 0%, #1b2a3f 60%, #0d1b2a 100%);
      color: #faf4e3;
      border-bottom: 2.5px solid #c9a961;
      box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.08);
      position: relative;
    }
    /* Borde dorado interno superior — toque premium */
    .ticket--pro .pro-head::before {
      content: '';
      position: absolute;
      inset: 2pt;
      border: 0.4px solid rgba(201, 169, 97, 0.5);
      border-radius: 1.5pt;
      pointer-events: none;
    }

    .pro-head__brand {
      min-width: 0;
      position: relative;
    }
    .pro-head__eyebrow {
      font-size: 6pt;
      letter-spacing: 0.32em;
      color: #c9a961;
      font-weight: 700;
      margin-bottom: 2pt;
    }
    .pro-head__name {
      font-family: 'Inter', Georgia, serif;
      font-weight: 800;
      font-size: 11pt;
      line-height: 1.1;
      color: #faf4e3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      letter-spacing: 0.01em;
    }
    .pro-head__label {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4pt 9pt;
      background: rgba(201, 169, 97, 0.15);
      border: 1px solid #c9a961;
      border-radius: 3pt;
      flex-shrink: 0;
    }
    .pro-head__label small {
      font-size: 5.5pt;
      letter-spacing: 0.22em;
      color: #c9a961;
      font-weight: 700;
    }
    .pro-head__label strong {
      font-family: 'Inter', sans-serif;
      font-weight: 900;
      font-size: 15pt;
      line-height: 1;
      color: #faf4e3;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
      margin-top: 1pt;
    }

    /* === Body: TV + números === */
    .pro-body {
      display: grid;
      grid-template-columns: 42% 58%;
      gap: 8pt;
      padding: 0.12in 0.14in;
      background:
        radial-gradient(ellipse at 50% 0%, rgba(201,169,97,0.08) 0%, transparent 50%),
        linear-gradient(180deg, #faf4e3 0%, #f4ecd2 100%);
      border-bottom: 1px solid rgba(201, 169, 97, 0.45);
      position: relative;
      z-index: 1;
    }

    .pro-tv {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding-right: 6pt;
      border-right: 0.5px dashed rgba(201, 169, 97, 0.5);
    }
    .pro-tv svg {
      width: 100%;
      max-width: 1.45in;
      height: auto;
      filter: drop-shadow(0 3pt 4pt rgba(0,0,0,0.22));
    }
    .pro-tv__caption {
      margin-top: 5pt;
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: #0d1b2a;
      text-align: center;
      text-transform: uppercase;
    }
    .pro-tv__caption strong {
      font-weight: 900;
      color: #722f37;
      letter-spacing: 0.05em;
    }

    .pro-numbers {
      padding-left: 4pt;
      display: flex;
      flex-direction: column;
      gap: 5pt;
      min-height: 0;
    }
    .pro-numbers__title {
      font-size: 6.5pt;
      letter-spacing: 0.22em;
      color: #0d1b2a;
      font-weight: 800;
      text-align: center;
      padding-bottom: 4pt;
      border-bottom: 0.5px solid #c9a961;
      position: relative;
    }
    /* Pequeños puntos dorados a los lados del título */
    .pro-numbers__title::before,
    .pro-numbers__title::after {
      content: '◆';
      color: #c9a961;
      font-size: 5pt;
      margin: 0 4pt;
      vertical-align: 1pt;
    }
    .pro-numbers__grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 3pt;
    }
    .pro-num {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 3.5pt 2pt;
      background: linear-gradient(180deg, #ffffff 0%, #faf4e3 100%);
      border: 1px solid #0d1b2a;
      border-radius: 2pt;
      font-family: 'Inter', sans-serif;
      font-weight: 800;
      font-size: 9pt;
      color: #0d1b2a;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.02em;
      box-shadow:
        inset 0 -1pt 0 rgba(13, 27, 42, 0.08),
        0 0.5pt 0 rgba(201, 169, 97, 0.2);
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    /* === Premios === */
    .pro-prizes {
      padding: 0.07in 0.14in 0.05in;
      display: grid;
      gap: 2pt;
      background: #faf4e3;
      position: relative;
      z-index: 1;
    }
    .pro-prize {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 5pt;
      align-items: center;
      padding: 2.5pt 6pt;
      font-size: 7pt;
      color: #0d1b2a;
      border-radius: 2pt;
    }
    .pro-prize__dot {
      font-size: 7pt;
      color: #c9a961;
      width: 8pt;
      text-align: center;
    }
    .pro-prize__name {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      letter-spacing: 0.01em;
    }
    .pro-prize__date {
      font-size: 6.5pt;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: #722f37;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .pro-prize--main {
      background: linear-gradient(135deg, #fbecc6 0%, #f5dca0 100%);
      border: 1px solid #c9a961;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.4);
    }
    .pro-prize--main .pro-prize__dot {
      font-size: 9pt;
      color: #722f37;
    }
    .pro-prize--main .pro-prize__name {
      font-weight: 800;
      color: #5a3a14;
    }
    .pro-prize--main .pro-prize__date {
      background: #0d1b2a;
      color: #c9a961;
      padding: 1.5pt 6pt;
      border-radius: 999px;
      letter-spacing: 0.12em;
    }

    /* === Footer premium: 3 columnas estrictas, info en grid de 2 cols === */
    .pro-foot {
      display: grid;
      grid-template-columns: auto 1fr auto;
      column-gap: 0.14in;
      padding: 0.1in 0.14in 0.11in;
      align-items: center;
      background:
        linear-gradient(180deg, #f4ecd2 0%, #ede1b8 100%);
      border-top: 1px solid rgba(201, 169, 97, 0.55);
      position: relative;
      z-index: 1;
    }
    /* Caja del QR con caption */
    .pro-foot__qr-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2pt;
    }
    .pro-foot__qr {
      width: 0.72in;
      height: 0.72in;
      border: 1.5px solid #c9a961;
      border-radius: 3pt;
      padding: 2pt;
      background: #fff;
      image-rendering: pixelated;
      box-shadow:
        0 0 0 1px rgba(13, 27, 42, 0.1),
        0 1pt 2pt rgba(0,0,0,0.1);
    }
    .pro-foot__qr-caption {
      font-size: 5pt;
      letter-spacing: 0.16em;
      color: #722f37;
      font-weight: 700;
      text-transform: uppercase;
    }

    /* Info en grid de 2 columnas (label fijo + valor flex) — todo
       perfectamente alineado verticalmente sin importar el largo del valor */
    .pro-foot__info {
      display: grid;
      grid-template-columns: auto 1fr;
      column-gap: 8pt;
      row-gap: 2.5pt;
      align-items: baseline;
      min-width: 0;
      font-size: 6.5pt;
    }
    .pro-foot__row {
      display: contents; /* permite que label+value compartan la misma row del parent grid */
    }
    .pro-foot__label {
      font-size: 5.5pt;
      letter-spacing: 0.14em;
      color: #722f37;
      font-weight: 800;
      text-transform: uppercase;
      white-space: nowrap;
      text-align: right;
      padding-top: 1pt;
    }
    .pro-foot__value {
      font-size: 6.8pt;
      font-weight: 700;
      color: #0d1b2a;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .pro-foot__value--em { font-weight: 800; }
    .pro-foot__value--mono {
      font-family: 'Courier New', monospace;
      letter-spacing: 0.12em;
      color: #722f37;
      font-size: 6.5pt;
    }
    /* Separador antes del código (línea dorada sutil entre filas) */
    .pro-foot__row--code .pro-foot__label,
    .pro-foot__row--code .pro-foot__value {
      padding-top: 3pt;
      border-top: 0.4px dashed rgba(201, 169, 97, 0.5);
      margin-top: 1pt;
    }
    .pro-foot__price {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 6pt 10pt;
      background:
        linear-gradient(135deg, #0d1b2a 0%, #1b2a3f 60%, #0d1b2a 100%);
      color: #faf4e3;
      border-radius: 3pt;
      border: 1.5px solid #c9a961;
      flex-shrink: 0;
      box-shadow:
        inset 0 0 0 1px rgba(201, 169, 97, 0.3),
        0 1pt 3pt rgba(13, 27, 42, 0.18);
    }
    .pro-foot__price small {
      font-size: 5.5pt;
      letter-spacing: 0.24em;
      color: #c9a961;
      font-weight: 700;
    }
    .pro-foot__price strong {
      font-family: 'Inter', sans-serif;
      font-size: 11pt;
      font-weight: 900;
      color: #faf4e3;
      margin-top: 1pt;
      letter-spacing: 0.01em;
    }

    /* Watermark "RIFA OFICIAL" diagonal sutil */
    .pro-watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-25deg);
      font-family: 'Inter', sans-serif;
      font-weight: 900;
      font-size: 26pt;
      letter-spacing: 0.15em;
      color: rgba(201, 169, 97, 0.08);
      pointer-events: none;
      white-space: nowrap;
      z-index: 0;
    }

    /* Compactaciones del modo 6-por-hoja */
    .page--six .ticket--pro .pro-head { padding: 0.07in 0.1in; }
    .page--six .ticket--pro .pro-head__name { font-size: 9pt; }
    .page--six .ticket--pro .pro-head__label strong { font-size: 12pt; }
    .page--six .ticket--pro .pro-body { padding: 0.08in 0.1in; gap: 5pt; }
    .page--six .ticket--pro .pro-tv svg { max-width: 1.15in; }
    .page--six .ticket--pro .pro-num { font-size: 7.5pt; padding: 2.5pt 1pt; }
    .page--six .ticket--pro .pro-numbers__title { font-size: 6pt; }
    .page--six .ticket--pro .pro-prizes { padding: 0.04in 0.1in 0.02in; }
    .page--six .ticket--pro .pro-prize { padding: 1.5pt 4pt; font-size: 6.5pt; }
    .page--six .ticket--pro .pro-foot { padding: 0.07in 0.1in 0.08in; }
    .page--six .ticket--pro .pro-foot__qr { width: 0.55in; height: 0.55in; }
    .page--six .ticket--pro .pro-foot__qr-caption { font-size: 4.5pt; }
    .page--six .ticket--pro .pro-foot__info { font-size: 6pt; row-gap: 1.5pt; }
    .page--six .ticket--pro .pro-foot__label { font-size: 5pt; }
    .page--six .ticket--pro .pro-foot__value { font-size: 6pt; }
    .page--six .ticket--pro .pro-foot__price { padding: 4pt 7pt; }
    .page--six .ticket--pro .pro-foot__price strong { font-size: 9pt; }
    .page--six .ticket--pro .pro-watermark { font-size: 20pt; }

    /* === Modo impresión === */
    @media print {
      :host { background: #fff; padding: 0; }
      .page {
        box-shadow: none;
        margin: 0;
        padding: 0.35in 0.3in;
        width: 100%;
        min-height: 100vh;
      }
      .page-header {
        font-size: 8pt;
      }
      @page {
        size: letter;
        margin: 0;
      }
    }
  `],
})
export class TicketPrintSheetComponent implements OnInit {
  readonly data = input.required<PrintData>();
  /** Origin del sitio (https://rifas.vercel.app). Se usa para armar las URLs de los QRs. */
  readonly origin = input<string>(typeof window !== 'undefined' ? window.location.origin : '');
  /** Cuántas boletas caben en cada hoja carta. 4 (2x2) o 6 (2x3). */
  readonly boletasPerPage = input<4 | 6>(4);
  /** Diseño del cuerpo de la boleta:
   *  - 'soccer'      → cancha de fútbol con números en formación 3-4-3 (default)
   *  - 'professional' → boleta tradicional elegante: TV ilustrado + grilla
   *    de 20 números + premios listados, estilo rifa clásica con toque premium. */
  readonly printDesign = input<PrintDesign>('soccer');

  readonly loading = signal(true);
  private readonly rendered = signal<RenderedTicket[]>([]);

  readonly pages = computed<RenderedTicket[][]>(() => {
    const all = this.rendered();
    const size = this.boletasPerPage();
    const out: RenderedTicket[][] = [];
    for (let i = 0; i < all.length; i += size) {
      out.push(all.slice(i, i + size));
    }
    return out;
  });

  async ngOnInit() {
    await this.generateQrs();
    this.loading.set(false);
  }

  private async generateQrs() {
    const QR = (await import('qrcode')).default;
    const tickets = this.data().tickets;
    const raffleId = this.data().raffle_id;
    const origin = this.origin();

    const opts = (color: string) => ({
      errorCorrectionLevel: 'M' as const,
      margin: 1,
      width: 200,
      color: { dark: color, light: '#ffffff' },
    });

    // Ambos QR llevan a la misma página pública de verificación promo.
    // No requiere login → no hay riesgo de 'pantalla oscura' por authGuard
    // si el admin no estaba autenticado en su celular al escanear el talón.
    //
    // Propósito por contexto:
    //   - QR del talón: el admin lo escanea cuando recibe el talón del
    //     vendedor para validar que la boleta existe y ver su estado.
    //   - QR de la boleta: el cliente lo escanea para ver su boleta
    //     con la cancha y verificar que sigue activa.
    //
    // El destino es el mismo (auto-verify del código en /r/:id?b=) pero
    // los dibujamos en colores ligeramente distintos para diferenciarlos
    // visualmente en la hoja impresa.
    const rendered: RenderedTicket[] = [];
    for (const t of tickets) {
      const verifyUrl = `${origin}/r/${raffleId}?b=${encodeURIComponent(t.code)}`;
      const [qrAdmin, qrPromo] = await Promise.all([
        QR.toDataURL(verifyUrl, opts('#1f2937')),
        QR.toDataURL(verifyUrl, opts('#0a0e0c')),
      ]);
      rendered.push({ ...t, qrAdmin, qrPromo });
    }
    this.rendered.set(rendered);
  }

  /** "001" → "BOL 001". Mantiene formato consistente con la app. */
  formatLabel(label: string): string {
    return `BOL ${label}`;
  }

  /** Formato COP sin decimales (20000 → "20.000"). */
  fmt(v: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);
  }

  formatDate(iso: string): string {
    const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /** "2026-09-17" → "17 JUL". Compacto, usado en cards de premios del
   *  diseño profesional. */
  formatShortDate(iso: string): string {
    const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
    if (isNaN(d.getTime())) return iso;
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    return `${day} ${months[d.getMonth()]}`;
  }

  /**
   * Coordenadas en % para los 20 jugadores siguiendo la formación 3-4-3 / 3-4-3
   * de la cancha vertical. Replica el cálculo del componente TicketDesign de la
   * app para que las boletas impresas se vean idénticas al diseño digital.
   */
  positionedFor(numbers: string[]): Array<{ number: string; x: number; y: number }> {
    if (!numbers || numbers.length !== 20) return [];
    const result: Array<{ number: string; x: number; y: number }> = [];
    const rows = [3, 4, 3] as const;
    const topYs = [38, 25, 12];        // mitad superior: del centro hacia arriba
    const bottomYs = [62, 75, 88];     // mitad inferior: del centro hacia abajo

    let i = 0;
    for (let r = 0; r < rows.length; r++) {
      const count = rows[r];
      const y = topYs[r];
      for (let k = 0; k < count; k++) {
        const x = ((k + 1) * 100) / (count + 1);
        result.push({ number: numbers[i++], x, y });
      }
    }
    for (let r = 0; r < rows.length; r++) {
      const count = rows[r];
      const y = bottomYs[r];
      for (let k = 0; k < count; k++) {
        const x = ((k + 1) * 100) / (count + 1);
        result.push({ number: numbers[i++], x, y });
      }
    }
    return result;
  }
}
