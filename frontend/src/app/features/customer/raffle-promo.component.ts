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
              <small class="kicker">Vive la emoción del <span class="gold">Mundial 2026</span></small>
              <h1>{{ d.name }}</h1>
              @if (d.prizes.length > 1) {
                <p class="opps">
                  <strong>{{ d.prizes.length }} oportunidades</strong> de ganar
                </p>
              }
              @if (d.lottery_name) {
                <p class="lottery">
                  <span class="material-icons">casino</span>
                  Sorteamos con <strong>{{ d.lottery_name }}</strong>
                </p>
              }
              <div class="counters">
                <div class="counter">
                  <strong>{{ d.days_to_final_draw }}</strong>
                  <small>{{ d.days_to_final_draw === 1 ? 'día' : 'días' }} al sorteo</small>
                </div>
                <div class="counter">
                  <strong>{{ d.prizes.length }}</strong>
                  <small>{{ d.prizes.length === 1 ? 'premio' : 'premios' }}</small>
                </div>
              </div>
            </div>

            <!-- TV realista con trofeo y stadium glow (si no hay foto del premio principal) -->
            <div class="hero__visual">
              @if (heroImage()) {
                <img [src]="heroImage()" alt="{{ d.prizes[0]?.name || 'Premio' }}" />
              } @else {
                <svg class="tv-svg" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <defs>
                    <linearGradient id="tvScreen" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stop-color="#0a1a2e" />
                      <stop offset="50%" stop-color="#050d18" />
                      <stop offset="100%" stop-color="#02060c" />
                    </linearGradient>
                    <radialGradient id="stadiumGlow" cx="0.5" cy="0.35" r="0.6">
                      <stop offset="0%" stop-color="rgba(212,168,87,0.35)" />
                      <stop offset="40%" stop-color="rgba(212,168,87,0.08)" />
                      <stop offset="100%" stop-color="rgba(0,0,0,0)" />
                    </radialGradient>
                    <linearGradient id="trophyShine" x1="0" x2="1" y1="0" y2="0">
                      <stop offset="0%" stop-color="#8a6420" />
                      <stop offset="40%" stop-color="#f5d57a" />
                      <stop offset="60%" stop-color="#ffe89a" />
                      <stop offset="100%" stop-color="#8a6420" />
                    </linearGradient>
                    <linearGradient id="bezelGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stop-color="#1a1a1a" />
                      <stop offset="100%" stop-color="#050505" />
                    </linearGradient>
                  </defs>

                  <!-- Marco TV con sombra -->
                  <rect x="8" y="6" width="384" height="232" rx="8" ry="8" fill="url(#bezelGrad)" />
                  <rect x="8" y="6" width="384" height="232" rx="8" ry="8" fill="none"
                        stroke="rgba(255,255,255,0.06)" stroke-width="0.5" />

                  <!-- Pantalla -->
                  <rect x="16" y="14" width="368" height="216" rx="3" ry="3" fill="url(#tvScreen)" />
                  <!-- Stadium glow desde el centro-arriba -->
                  <rect x="16" y="14" width="368" height="216" rx="3" ry="3" fill="url(#stadiumGlow)" />

                  <!-- 2026 marca de agua en pantalla -->
                  <text x="200" y="115" font-family="Inter, sans-serif" font-weight="900" font-size="78"
                        text-anchor="middle" fill="rgba(212,168,87,0.16)" letter-spacing="0.04em">2026</text>

                  <!-- Trofeo Mundial estilizado en el centro -->
                  <g transform="translate(168, 56)">
                    <!-- Sombra base -->
                    <ellipse cx="32" cy="125" rx="34" ry="4" fill="rgba(0,0,0,0.55)" />
                    <!-- Base trofeo -->
                    <rect x="20" y="108" width="24" height="14" fill="#7a5a18" />
                    <rect x="16" y="100" width="32" height="10" fill="#9a7320" />
                    <rect x="22" y="92" width="20" height="10" fill="url(#trophyShine)" />
                    <!-- Copa: forma estilizada del trofeo FIFA -->
                    <path d="M 16 28
                             Q 16 64 28 84
                             Q 32 90 36 84
                             Q 48 64 48 28
                             L 52 22 L 52 14
                             L 42 14 L 42 4
                             L 22 4 L 22 14
                             L 12 14 L 12 22 Z"
                          fill="url(#trophyShine)"
                          stroke="#8a6420" stroke-width="0.5" />
                    <!-- Brillo lateral -->
                    <path d="M 24 16 Q 24 50 30 76" stroke="rgba(255,255,255,0.45)" stroke-width="1.4" fill="none" />
                  </g>

                  <!-- Badge 4K Ultra HD -->
                  <g transform="translate(30, 188)">
                    <rect x="0" y="0" width="78" height="30" rx="4" fill="#0a0a0a" stroke="rgba(212,168,87,0.6)" stroke-width="1.2" />
                    <text x="39" y="14" text-anchor="middle" font-family="Inter, sans-serif" font-size="11"
                          font-weight="900" fill="#d4a857" letter-spacing="0.04em">4K</text>
                    <text x="39" y="25" text-anchor="middle" font-family="Inter, sans-serif" font-size="7"
                          font-weight="700" fill="rgba(212,168,87,0.85)" letter-spacing="0.16em">ULTRA HD</text>
                  </g>

                  <!-- Puntos de luz tipo estadio (parte superior) -->
                  <circle cx="80" cy="32" r="1.4" fill="rgba(255,235,180,0.5)" />
                  <circle cx="140" cy="28" r="1.2" fill="rgba(255,235,180,0.4)" />
                  <circle cx="260" cy="28" r="1.2" fill="rgba(255,235,180,0.4)" />
                  <circle cx="320" cy="32" r="1.4" fill="rgba(255,235,180,0.5)" />

                  <!-- Base/stand del TV -->
                  <rect x="186" y="240" width="28" height="8" fill="#0a0a0a" />
                  <path d="M 120 264 L 280 264 L 256 280 L 144 280 Z" fill="#0a0a0a" stroke="rgba(255,255,255,0.06)" stroke-width="0.5" />
                </svg>
              }
            </div>
          </div>
        </section>

        <!-- Auto-verify destacado (cuando viene de QR con ?b=) -->
        @if (autoVerifyResult(); as v) {
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
              <article class="prize" [class.prize--main]="p.position === 1">
                @if (p.position === 1) {
                  <span class="prize__tag">
                    <span class="material-icons">emoji_events</span> PRINCIPAL
                  </span>
                }
                <div class="prize__pos">{{ p.position }}</div>
                @if (p.image_url) {
                  <img class="prize__img" [src]="p.image_url" alt="{{ p.name }}" />
                } @else {
                  <div class="prize__img prize__img--placeholder">
                    <span class="material-icons">{{ p.position === 1 ? 'emoji_events' : 'card_giftcard' }}</span>
                  </div>
                }
                <div class="prize__body">
                  <strong>{{ p.name }}</strong>
                  @if (p.estimated_value && p.position !== 1) {
                    <small class="value">{{ '$' + fmt(p.estimated_value) }}</small>
                  }
                  <small class="date">Sorteo: {{ formatDate(p.draw_date) }}</small>
                </div>
              </article>
            }
          </div>
        </section>

        <!-- ¿POR QUÉ CONFIAR? — credibilidad/trust -->
        <section class="block">
          <h2 class="block__title">¿Por qué participar con confianza?</h2>
          <div class="trust-grid">
            <article class="trust">
              <span class="material-icons">verified</span>
              <strong>Lotería oficial</strong>
              <small>
                @if (d.lottery_name) {
                  Sorteamos con <strong>{{ d.lottery_name }}</strong>, lotería regulada por el Estado colombiano.
                } @else {
                  Sorteamos con una lotería oficial regulada por el Estado colombiano.
                }
              </small>
            </article>
            <article class="trust">
              <span class="material-icons">qr_code_2</span>
              <strong>Boleta única con QR</strong>
              <small>Cada boleta tiene un código único e irrepetible y un QR para verificarla en línea desde tu celular.</small>
            </article>
            <article class="trust">
              <span class="material-icons">manage_search</span>
              <strong>Verificación pública</strong>
              <small>Cualquier persona puede verificar el estado de una boleta desde este sitio, sin login. Total transparencia.</small>
            </article>
            <article class="trust">
              <span class="material-icons">support_agent</span>
              <strong>Organizador identificado</strong>
              <small>
                @if (d.responsible_name) {
                  Esta rifa la respalda <strong>{{ d.responsible_name }}</strong>{{ d.responsible_phone ? ', con teléfono público de contacto.' : '.' }}
                } @else {
                  Esta rifa tiene un organizador con identidad pública responsable.
                }
              </small>
            </article>
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
              placeholder="Ej: 001 o IH3-88V-7OZ"
              autocomplete="off"
              spellcheck="false"
            />
            <button type="submit" [disabled]="verifying()">
              {{ verifying() ? 'Verificando...' : 'Verificar' }}
            </button>
          </form>
          <small class="muted">Escribe el número (001) o el código completo (con guiones) de tu boleta.</small>

          @if (verifyResult(); as v) {
            <article class="verify-result" [class.verify-result--ok]="v.found" [class.verify-result--win]="v.is_winner">
              @if (v.found) {
                <span class="material-icons">{{ v.is_winner ? 'emoji_events' : 'verified' }}</span>
                <div>
                  <strong>
                    Boleta BOL {{ v.number_label }} —
                    {{ v.is_winner ? 'GANADORA 🎉' : (v.is_paid ? 'pagada' : 'activa') }}
                  </strong>
                  @if (v.numbers && v.numbers.length) {
                    <small class="nums">Tus números: {{ v.numbers.join(' · ') }}</small>
                  }
                </div>
              } @else {
                <span class="material-icons">help_outline</span>
                <div>
                  <strong>No encontramos esa boleta</strong>
                  <small>{{ v.message || 'Revisa el código o pregúntale a tu vendedor.' }}</small>
                </div>
              }
            </article>
          }
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

        <!-- Trust badges row antes del footer -->
        <section class="trust-row">
          <div class="trust-row__item">
            <span class="material-icons">lock</span>
            <small>Pago seguro</small>
          </div>
          <div class="trust-row__item">
            <span class="material-icons">verified_user</span>
            <small>Verificación pública</small>
          </div>
          <div class="trust-row__item">
            <span class="material-icons">confirmation_number</span>
            <small>Boleta única con QR</small>
          </div>
        </section>

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
      width: 100%;
      max-width: 360px;
      height: auto;
      filter: drop-shadow(0 16px 32px rgba(0,0,0,0.5))
              drop-shadow(0 0 24px rgba(212, 168, 87, 0.08));
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

    /* Resultado de verificación manual, pegado debajo del form */
    .verify-result {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-top: 14px;
      padding: 14px 16px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 12px;
      animation: vrFadeIn 0.25s ease-out;
    }
    .verify-result .material-icons {
      font-size: 26px;
      color: #ef4444;
      flex-shrink: 0;
    }
    .verify-result div { display: flex; flex-direction: column; gap: 3px; }
    .verify-result strong { color: #fff; font-size: 14px; }
    .verify-result small { color: rgba(255,255,255,0.7); font-size: 12px; }
    .verify-result .nums {
      font-family: 'Courier New', monospace;
      letter-spacing: 0.04em;
      font-size: 11.5px;
      color: rgba(255,255,255,0.85);
    }
    .verify-result--ok {
      background: rgba(30, 199, 123, 0.12);
      border-color: rgba(30, 199, 123, 0.35);
    }
    .verify-result--ok .material-icons { color: #1ec77b; }
    .verify-result--win {
      background: linear-gradient(135deg, rgba(212, 168, 87, 0.18), rgba(30, 199, 123, 0.14));
      border-color: rgba(212, 168, 87, 0.55);
    }
    .verify-result--win .material-icons { color: #d4a857; }
    @keyframes vrFadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }

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

    /* === Mejoras hero === */
    .gold { color: #d4a857; }
    .opps {
      font-size: 16px;
      color: #fff;
      margin: 4px 0 8px;
    }
    .opps strong {
      color: #d4a857;
      font-weight: 800;
    }
    .lottery {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: rgba(255,255,255,0.78);
      margin: 0 0 16px;
      padding: 4px 10px;
      background: rgba(212, 168, 87, 0.08);
      border: 1px solid rgba(212, 168, 87, 0.2);
      border-radius: 999px;
    }
    .lottery .material-icons { font-size: 16px; color: #d4a857; }
    .lottery strong { color: #d4a857; font-weight: 700; }

    /* === Prize main destacado === */
    .prize {
      position: relative;
    }
    .prize--main {
      background: linear-gradient(135deg,
        rgba(212, 168, 87, 0.14),
        rgba(212, 168, 87, 0.04));
      border-color: rgba(212, 168, 87, 0.5);
      box-shadow: 0 0 0 1px rgba(212, 168, 87, 0.25),
                  0 8px 24px rgba(212, 168, 87, 0.08);
    }
    .prize--main .prize__pos {
      background: linear-gradient(135deg, #d4a857, #b88a35);
      color: #0a0e0c;
      border-color: #d4a857;
    }
    .prize--main .prize__body strong { color: #f5e0a8; font-size: 16px; }
    .prize__tag {
      position: absolute;
      top: -10px;
      right: 14px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 10px;
      background: linear-gradient(135deg, #d4a857, #b88a35);
      color: #0a0e0c;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.1em;
      border-radius: 999px;
      box-shadow: 0 4px 12px rgba(212, 168, 87, 0.4);
    }
    .prize__tag .material-icons { font-size: 13px; }

    /* === Trust grid (¿Por qué confiar?) === */
    .trust-grid {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }
    .trust {
      padding: 16px;
      background: linear-gradient(135deg,
        rgba(30, 199, 123, 0.05),
        rgba(255, 255, 255, 0.02));
      border: 1px solid rgba(30, 199, 123, 0.18);
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .trust > .material-icons {
      font-size: 28px;
      color: #1ec77b;
      margin-bottom: 4px;
    }
    .trust strong {
      color: #fff;
      font-size: 14px;
      font-weight: 800;
    }
    .trust small {
      color: rgba(255,255,255,0.7);
      font-size: 12.5px;
      line-height: 1.5;
    }
    .trust small strong {
      color: #1ec77b;
      font-weight: 700;
      font-size: 12.5px;
    }

    /* === Trust badges row (chips antes del footer) === */
    .trust-row {
      display: flex;
      justify-content: center;
      gap: 18px;
      flex-wrap: wrap;
      padding: 20px 12px;
      margin-top: 28px;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 14px;
    }
    .trust-row__item {
      display: flex;
      align-items: center;
      gap: 6px;
      color: rgba(255,255,255,0.75);
      font-size: 12.5px;
      font-weight: 600;
    }
    .trust-row__item .material-icons {
      font-size: 18px;
      color: #1ec77b;
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
  /** Resultado de la verificación manual (input + botón) — se muestra debajo del form. */
  readonly verifyResult = signal<VerifyView | null>(null);
  /** Resultado del auto-verify cuando llega ?b=<code> del QR — se muestra arriba destacado. */
  readonly autoVerifyResult = signal<VerifyView | null>(null);

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

        // Auto-verifica si vino ?b=<code> en el query (escaneo de QR)
        const b = this.route.snapshot.queryParamMap.get('b');
        if (b) {
          this.runVerify(b, /*auto*/ true);
        }
      },
      error: (e) => {
        const detail = e?.error?.detail;
        this.error.set(typeof detail === 'string' ? detail : 'No se pudo cargar la rifa.');
        this.loading.set(false);
      },
    });
  }

  /** Disparado por el botón del formulario. Muestra resultado debajo del input. */
  doVerify(code: string) {
    this.runVerify(code, /*auto*/ false);
  }

  /** Verificación común. Si auto=true muestra el banner destacado arriba.
   *  Si auto=false muestra el resultado pegado debajo del input. */
  private runVerify(code: string, auto: boolean) {
    if (!code || code.trim().length < 1) return;
    this.verifying.set(true);
    if (auto) this.autoVerifyResult.set(null);
    else this.verifyResult.set(null);

    const cleaned = code.trim();
    const raffleId = this.data()?.id;
    if (!raffleId) {
      this.verifying.set(false);
      return;
    }

    // Endpoint público scoped al raffle: acepta código completo (IH3-88V-7OZ)
    // o etiqueta corta (001) gracias al backend que lo resuelve.
    const url = `${environment.apiUrl}/public/raffles/${raffleId}/verify?q=${encodeURIComponent(cleaned)}`;

    this.http.get<VerifyResponse>(url).subscribe({
      next: (r) => {
        const view: VerifyView = {
          found: r.valid,
          number_label: r.ticket?.label,
          numbers: r.ticket?.numbers,
          is_paid: r.ticket?.is_paid,
          is_winner: r.ticket?.is_winner,
        };
        if (auto) this.autoVerifyResult.set(view);
        else this.verifyResult.set(view);
        this.verifying.set(false);
      },
      error: () => {
        const view: VerifyView = {
          found: false,
          message: 'No encontramos esa boleta en esta rifa. Revisa el número o el código.',
        };
        if (auto) this.autoVerifyResult.set(view);
        else this.verifyResult.set(view);
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
