import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Raffle } from '@core/models/raffle.model';
import {
  ActiveReservation,
  ManualTransferSubmission,
  PublicSalesAdminService,
  WompiConfig,
  WompiConfigInput,
} from '@core/services/public-sales-admin.service';
import { RaffleService } from '@core/services/raffle.service';
import { ToastService } from '@core/services/toast.service';

/**
 * Panel de configuración de VENTA PÚBLICA para el admin.
 *
 * 3 secciones:
 *   1. Configurar Wompi del tenant (llaves y entorno)
 *   2. Toggle público/privado + habilitación de compra online por rifa
 *   3. Bandeja de transferencias manuales pendientes de revisión
 *
 * Ruta: /admin/publico
 */
@Component({
  selector: 'app-public-sales-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page__head">
        <div>
          <h1>Venta pública online</h1>
          <p class="muted">Configura Wompi, activa la compra pública por rifa y revisa transferencias.</p>
        </div>
      </header>

      <!-- ============ CONFIG WOMPI ============ -->
      <section class="card">
        <h2>Wompi (pasarela de pago)</h2>
        <p class="muted">
          Registra las llaves de tu cuenta Wompi. Las llaves privadas se guardan cifradas.
          <a href="https://comercios.wompi.co/" target="_blank" rel="noopener">Crear cuenta gratis</a>
        </p>

        <div class="wompi-status">
          @if (wompiConfig(); as w) {
            <div class="status-grid">
              <div><small>Public key</small><strong>{{ w.public_key ? (w.public_key | slice:0:20) + '...' : '—' }}</strong></div>
              <div><small>Entorno</small><strong>{{ w.env }}</strong></div>
              <div><small>Private key</small><strong>{{ w.private_key_configured ? '✓ configurada' : '—' }}</strong></div>
              <div><small>Webhook</small><strong>{{ w.webhook_secret_configured ? '✓' : '—' }}</strong></div>
              <div><small>Integrity</small><strong>{{ w.integrity_key_configured ? '✓' : '—' }}</strong></div>
            </div>
          }
        </div>

        <form class="form" (ngSubmit)="saveWompi()">
          <label class="field">
            <span>Entorno</span>
            <select [(ngModel)]="wompiForm.env" name="env">
              <option value="sandbox">Sandbox (pruebas)</option>
              <option value="production">Producción</option>
            </select>
          </label>
          <label class="field">
            <span>Public key</span>
            <input type="text" [(ngModel)]="wompiForm.public_key" name="pk" placeholder="pub_prod_XXXX" />
          </label>
          <label class="field">
            <span>Private key</span>
            <input type="password" [(ngModel)]="wompiForm.private_key" name="sk" placeholder="prv_prod_XXXX" />
          </label>
          <label class="field">
            <span>Webhook secret</span>
            <input type="password" [(ngModel)]="wompiForm.webhook_secret" name="ws" />
          </label>
          <label class="field">
            <span>Integrity key</span>
            <input type="password" [(ngModel)]="wompiForm.integrity_key" name="ik" />
          </label>
          <div class="form__cta">
            <button type="submit" class="btn primary" [disabled]="savingWompi()">
              {{ savingWompi() ? 'Guardando...' : 'Guardar credenciales Wompi' }}
            </button>
          </div>
        </form>
      </section>

      <!-- ============ RIFAS: TOGGLE PÚBLICO ============ -->
      <section class="card">
        <h2>Rifas — habilitación pública</h2>
        <p class="muted">Elige qué rifas se ven en el portal público y cuáles aceptan pago Wompi o transferencia manual.</p>

        @if (loadingRaffles()) {
          <p class="muted">Cargando rifas...</p>
        } @else if (!raffles().length) {
          <p class="muted">No hay rifas creadas todavía.</p>
        } @else {
          <ul class="raffle-list">
            @for (r of raffles(); track r.id) {
              <li class="raffle-row">
                <div class="raffle-row__info">
                  <strong>{{ r.name }}</strong>
                  <small>{{ r.total_tickets }} boletas · \${{ formatNumber(r.ticket_price) }} c/u</small>
                </div>
                <div class="raffle-row__actions">
                  <label class="toggle">
                    <input type="checkbox"
                           [checked]="!!r.is_public"
                           (change)="toggleRaffle(r, 'is_public', $any($event.target).checked)" />
                    <span>Pública</span>
                  </label>
                  <label class="toggle">
                    <input type="checkbox"
                           [checked]="!!r.enable_online_purchase"
                           (change)="toggleRaffle(r, 'enable_online_purchase', $any($event.target).checked)" />
                    <span>Wompi</span>
                  </label>
                  <label class="toggle">
                    <input type="checkbox"
                           [checked]="!!r.enable_manual_transfer"
                           (change)="toggleRaffle(r, 'enable_manual_transfer', $any($event.target).checked)" />
                    <span>Transferencia manual</span>
                  </label>
                </div>
              </li>
            }
          </ul>
        }
      </section>

      <!-- ============ RESERVAS ACTIVAS ============ -->
      <section class="card">
        <div class="card__head">
          <h2>Reservas activas</h2>
          <label class="filter-toggle">
            <input type="checkbox" [(ngModel)]="onlyScheduled" (change)="loadReservations()" />
            Solo con fecha programada
          </label>
        </div>

        <div class="res-search">
          <span class="material-icons">search</span>
          <input type="text"
                 [ngModel]="reservationSearch()"
                 (ngModelChange)="reservationSearch.set($event)"
                 placeholder="Buscar cliente por nombre, cédula, teléfono, email o boleta…" />
          @if (reservationSearch()) {
            <button type="button" class="res-search__clear"
                    (click)="reservationSearch.set('')" aria-label="Limpiar">
              <span class="material-icons">close</span>
            </button>
          }
        </div>

        @if (filteredReservations().length === 0) {
          @if (reservationSearch()) {
            <p class="muted">Ningún cliente coincide con "{{ reservationSearch() }}".</p>
          } @else {
            <p class="muted">No hay reservas activas.</p>
          }
        } @else {
          <p class="muted res-count">
            {{ filteredReservations().length }} de {{ reservations().length }} reservas
          </p>
          <div class="res-table__scroll">
            <table class="res-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Rifa</th>
                  <th class="num">Boletas</th>
                  <th>Estado</th>
                  <th class="num">Monto</th>
                  <th class="act">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (r of filteredReservations(); track r.customer_id + '-' + r.raffle_id) {
                  <tr>
                    <td class="cell-customer">
                      <strong>{{ r.customer_name }}</strong>
                      @if (r.customer_phone) { <small>{{ r.customer_phone }}</small> }
                    </td>
                    <td class="cell-raffle">
                      <span>{{ r.raffle_name }}</span>
                    </td>
                    <td class="num cell-tickets">
                      <span class="pill-num">{{ r.ticket_labels.length }}</span>
                      <small>{{ r.ticket_labels.slice(0, 4).join(', ') }}{{ r.ticket_labels.length > 4 ? '…' : '' }}</small>
                    </td>
                    <td class="cell-status">
                      @if (r.scheduled_payment_date) {
                        <span class="tag">📅 {{ formatDateShort(r.scheduled_payment_date) }}</span>
                      } @else {
                        <span class="tag tag--warn">⏳ {{ formatDateShort(r.expires_at) }}</span>
                      }
                      @if (r.paid_amount > 0) {
                        <span class="tag tag--partial">💵 Falta \${{ formatNumber(remainingFor(r)) }}</span>
                      }
                    </td>
                    <td class="num cell-amount">
                      <strong>\${{ formatNumber(r.ticket_price * r.ticket_labels.length) }}</strong>
                      @if (r.paid_amount > 0) {
                        <small>Abonado \${{ formatNumber(r.paid_amount) }}</small>
                      }
                    </td>
                    <td class="act cell-actions">
                      @if (r.customer_phone) {
                        <a class="icon-btn icon-btn--wa" [href]="whatsappLink(r)"
                           target="_blank" rel="noopener"
                           title="Enviar WhatsApp a {{ r.customer_name }}">
                          <span class="material-icons">chat</span>
                        </a>
                      }
                      <button type="button" class="icon-btn icon-btn--pay"
                              (click)="openMarkPaid(r)"
                              [title]="r.paid_amount > 0 ? 'Registrar abono' : 'Registrar pago'">
                        <span class="material-icons">payments</span>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <!-- ============ MODAL: Registrar pago manual ============ -->
      @if (markPaidTarget(); as target) {
        <div class="mp-modal" (click)="closeMarkPaid()">
          <div class="mp-modal__card" (click)="$event.stopPropagation()">
            <div class="mp-modal__head">
              <div>
                <div class="mp-pill">Registrar pago</div>
                <h2 class="mp-modal__title">Pago recibido de {{ target.customer_name }}</h2>
                <p class="mp-muted">
                  {{ target.ticket_labels.length }} boleta(s): {{ target.ticket_labels.join(', ') }}
                  · Total: \${{ formatNumber(target.ticket_price * target.ticket_labels.length) }}
                  @if (target.paid_amount) {
                    · Ya pagado: \${{ formatNumber(target.paid_amount) }}
                    · Falta: \${{ formatNumber(remainingFor(target)) }}
                  }
                </p>
              </div>
              <button type="button" class="mp-x" (click)="closeMarkPaid()" aria-label="Cerrar">
                <span class="material-icons">close</span>
              </button>
            </div>
            <form class="mp-form" (ngSubmit)="submitMarkPaid()" autocomplete="off">
              <label class="mp-field">
                <span>Monto recibido (COP)</span>
                <input type="number" min="1" step="1000"
                       [(ngModel)]="markPaidForm.amount" name="amount" required />
                <small class="mp-muted">
                  Sugerido: \${{ formatNumber(remainingFor(target)) }}
                  (puedes registrar un abono parcial)
                </small>
              </label>
              <label class="mp-field">
                <span>Método de pago</span>
                <select [(ngModel)]="markPaidForm.payment_method"
                        name="method" required>
                  <option value="NEQUI">Nequi</option>
                  <option value="DAVIPLATA">Daviplata</option>
                  <option value="BANCOLOMBIA_TRANSFER">Bancolombia</option>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="OTHER">Otro</option>
                </select>
              </label>
              <label class="mp-field">
                <span>Referencia <small>opcional</small></span>
                <input type="text" maxlength="80"
                       [(ngModel)]="markPaidForm.reference" name="reference"
                       placeholder="Ej. ID transacción o últimos 4" />
              </label>
              <label class="mp-field">
                <span>Notas <small>opcional</small></span>
                <textarea rows="2" maxlength="500"
                          [(ngModel)]="markPaidForm.notes" name="notes"
                          placeholder="Ej. Comprobante recibido por WhatsApp"></textarea>
              </label>
              @if (markPaidError()) {
                <div class="mp-alert">{{ markPaidError() }}</div>
              }
              <div class="mp-actions">
                <button type="button" class="btn ghost" (click)="closeMarkPaid()"
                        [disabled]="markingPaid()">
                  Cancelar
                </button>
                <button type="submit" class="btn primary"
                        [disabled]="markingPaid() || !markPaidForm.amount">
                  @if (markingPaid()) {
                    Guardando…
                  } @else {
                    <span class="material-icons">check</span>
                    Registrar pago
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- ============ TRANSFERENCIAS PENDIENTES ============ -->
      <section class="card">
        <h2>Transferencias por revisar</h2>
        @if (transfers().length === 0) {
          <p class="muted">No hay transferencias pendientes.</p>
        } @else {
          <ul class="transfer-list">
            @for (t of transfers(); track t.id) {
              <li class="transfer">
                <div class="transfer__head">
                  <div>
                    <strong>{{ t.customer_name || 'Cliente' }}</strong>
                    <small>{{ t.customer_phone }}</small>
                  </div>
                  <div class="transfer__amount">
                    \${{ formatNumber(t.amount_declared) }}
                  </div>
                </div>
                <div class="transfer__meta">
                  <span>{{ t.raffle_name }}</span>
                  <span>· {{ t.payment_method }}</span>
                  <span>· {{ t.ticket_ids.length }} boleta(s)</span>
                  @if (t.reference) { <span>· ref {{ t.reference }}</span> }
                </div>
                @if (t.proof_url) {
                  <a class="proof" [href]="t.proof_url" target="_blank">
                    <span class="material-icons">image</span>
                    Ver comprobante
                  </a>
                }
                <div class="transfer__cta">
                  <button class="btn ghost" (click)="reviewTransfer(t, false)">Rechazar</button>
                  <button class="btn primary" (click)="reviewTransfer(t, true)">Aprobar</button>
                </div>
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; color: var(--text); }
    .page { max-width: 900px; margin: 0 auto; padding: var(--s-5); }
    .page__head { margin-bottom: var(--s-5); }
    .page__head h1 { margin: 0; font-size: 24px; }
    .muted { color: var(--text-muted); font-size: 13px; }

    .card {
      background: var(--bg-card);
      border-radius: var(--r-lg);
      padding: var(--s-5);
      margin-bottom: var(--s-4);
      border: 1px solid var(--border);
    }
    .card h2 { margin: 0 0 var(--s-2); font-size: 18px; }

    .wompi-status { margin: var(--s-3) 0; }
    .status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: var(--s-2);
      padding: var(--s-3);
      background: var(--bg-input);
      border-radius: var(--r-md);
    }
    .status-grid div { display: grid; }
    .status-grid small { color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
    .status-grid strong { font-size: 13px; font-family: 'Courier New', monospace; }

    /* ============ Modal Registrar pago ============ */
    .mp-modal {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(0, 0, 0, 0.65);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      animation: mp-fade 0.15s ease-out;
    }
    @keyframes mp-fade { from { opacity: 0; } to { opacity: 1; } }
    .mp-modal__card {
      background: var(--bg-card, #1a1f1c);
      border: 1px solid var(--border, rgba(255,255,255,0.1));
      border-radius: var(--r-md);
      padding: 20px;
      width: 100%; max-width: 500px;
      max-height: 90vh; overflow-y: auto;
      color: var(--text);
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
    }
    .mp-modal__head {
      display: flex; justify-content: space-between; align-items: start;
      gap: 12px; margin-bottom: 16px;
    }
    .mp-modal__title { margin: 4px 0; font-size: 17px; }
    .mp-pill {
      display: inline-block;
      padding: 3px 10px;
      background: rgba(34, 197, 94, 0.18);
      color: var(--accent, #22c55e);
      border-radius: 999px;
      font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.08em;
    }
    .mp-muted { color: var(--text-muted, #a1a1a1); font-size: 12.5px; line-height: 1.4; margin: 4px 0 0; }
    .mp-x {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px;
      background: transparent; border: none;
      color: var(--text-muted); border-radius: 8px;
      cursor: pointer;
    }
    .mp-x:hover { background: rgba(255,255,255,0.08); color: var(--text); }
    .mp-form { display: grid; gap: 12px; margin-top: 6px; }
    .mp-field { display: grid; gap: 4px; font-size: 12px; color: var(--text-muted); }
    .mp-field > span {
      font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
      font-size: 11px;
    }
    .mp-field > span small { text-transform: none; letter-spacing: 0; opacity: 0.7; }
    .mp-field input, .mp-field select, .mp-field textarea {
      width: 100%;
      padding: 10px 12px;
      background: var(--bg-input, rgba(255,255,255,0.05));
      border: 1px solid transparent;
      color: var(--text);
      border-radius: var(--r-md);
      font-size: 14px;
      font-family: inherit;
      box-sizing: border-box;
    }
    .mp-field textarea { resize: vertical; min-height: 60px; }
    .mp-field input:focus, .mp-field select:focus, .mp-field textarea:focus {
      outline: none; border-color: var(--accent, #22c55e);
    }
    .mp-alert {
      padding: 10px 12px;
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      border-radius: var(--r-md);
      font-size: 13px;
    }
    .mp-actions {
      display: flex; justify-content: flex-end; gap: 8px;
      margin-top: 4px;
    }
    @media (max-width: 520px) {
      .mp-modal { padding: 10px; }
      .mp-modal__card { padding: 16px; }
      .mp-actions { flex-direction: column-reverse; }
      .mp-actions .btn { width: 100%; justify-content: center; }
    }

    .form { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--s-3); margin-top: var(--s-3); }
    .field { display: grid; gap: 4px; font-size: 12px; color: var(--text-muted); }
    .field span { font-weight: 500; letter-spacing: 0.02em; text-transform: uppercase; }
    .field input, .field select {
      height: var(--h-input);
      padding: 0 var(--s-3);
      background: var(--bg-input);
      border: 1px solid transparent;
      color: var(--text);
      border-radius: var(--r-md);
      font-size: 14px;
    }
    .field input:focus, .field select:focus { outline: none; border-color: var(--accent); }
    .form__cta { grid-column: 1 / -1; display: flex; justify-content: flex-end; margin-top: var(--s-2); }

    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 16px;
      border-radius: var(--r-md);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn.primary { background: var(--accent); color: #0a0e0c; }
    .btn.ghost { background: transparent; border-color: var(--border); color: var(--text); }

    .raffle-list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s-2); }
    .raffle-row {
      display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;
      gap: var(--s-3);
      padding: var(--s-3);
      background: var(--bg-input);
      border-radius: var(--r-md);
    }
    .raffle-row__info strong { display: block; }
    .raffle-row__info small { display: block; color: var(--text-muted); font-size: 12px; }
    .raffle-row__actions { display: flex; gap: var(--s-3); flex-wrap: wrap; }

    .toggle {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px;
      cursor: pointer;
      user-select: none;
    }
    .toggle input { width: 16px; height: 16px; cursor: pointer; }

    /* ============ Reservas activas ============ */
    .card__head {
      display: flex; justify-content: space-between; align-items: center;
      gap: var(--s-3); flex-wrap: wrap;
    }
    .filter-toggle {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 12px; color: var(--text-muted);
      cursor: pointer; user-select: none;
    }
    .filter-toggle input { width: 14px; height: 14px; cursor: pointer; }

    .res-search {
      display: flex; align-items: center; gap: 8px;
      margin: var(--s-3) 0 var(--s-2);
      padding: 8px 12px;
      background: var(--bg-input);
      border: 1px solid transparent;
      border-radius: var(--r-md);
    }
    .res-search:focus-within { border-color: var(--accent); }
    .res-search .material-icons { color: var(--text-muted); font-size: 18px; }
    .res-search input {
      flex: 1; min-width: 0;
      background: transparent; border: none; outline: none;
      color: var(--text); font-size: 14px;
      padding: 4px 0;
    }
    .res-search__clear {
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 24px;
      background: transparent; border: none;
      color: var(--text-muted); border-radius: 50%;
      cursor: pointer;
    }
    .res-search__clear:hover { background: rgba(255,255,255,0.08); }
    .res-search__clear .material-icons { font-size: 16px; }
    .res-count { font-size: 12px; margin: 0 0 var(--s-2); }

    /* ============ Tabla compacta de reservas ============ */
    .res-table__scroll {
      overflow-x: auto;
      border-radius: var(--r-md);
      border: 1px solid var(--border, rgba(255,255,255,0.08));
    }
    .res-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      background: var(--bg-input);
    }
    .res-table th {
      text-align: left;
      padding: 10px 12px;
      background: rgba(255,255,255,0.04);
      color: var(--text-muted);
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      white-space: nowrap;
      border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
    }
    .res-table th.num { text-align: right; }
    .res-table th.act { text-align: right; width: 1%; white-space: nowrap; }
    .res-table td {
      padding: 10px 12px;
      vertical-align: middle;
      border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
    }
    .res-table tbody tr:last-child td { border-bottom: none; }
    .res-table tbody tr:hover { background: rgba(255,255,255,0.03); }
    .res-table td.num { text-align: right; font-variant-numeric: tabular-nums; }

    .cell-customer strong { display: block; color: var(--text); font-size: 13px; line-height: 1.25; }
    .cell-customer small { color: var(--text-muted); font-size: 11.5px; }
    .cell-raffle { color: var(--text-muted); font-size: 12.5px; max-width: 180px; }
    .cell-raffle span {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .cell-tickets { min-width: 90px; }
    .cell-tickets small {
      display: block;
      color: var(--text-muted); font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
    .pill-num {
      display: inline-block;
      padding: 2px 8px;
      background: rgba(34, 197, 94, 0.18);
      color: var(--accent, #22c55e);
      border-radius: 999px;
      font-size: 11.5px; font-weight: 700;
      font-variant-numeric: tabular-nums;
      margin-bottom: 2px;
    }
    .cell-status {
      display: flex; flex-direction: column; gap: 3px;
      align-items: flex-start;
    }
    .tag {
      display: inline-block;
      padding: 2px 8px;
      background: rgba(255,255,255,0.06);
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 600;
      white-space: nowrap;
    }
    .tag--warn { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
    .tag--partial { background: rgba(59, 130, 246, 0.18); color: #60a5fa; }
    .cell-amount strong {
      display: block; font-size: 13.5px; color: var(--accent, #22c55e);
      white-space: nowrap;
    }
    .cell-amount small { display: block; color: var(--text-muted); font-size: 10.5px; white-space: nowrap; }
    .cell-actions { text-align: right; white-space: nowrap; }
    .cell-actions .icon-btn { margin-left: 4px; }

    .icon-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 32px; height: 32px;
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--border, rgba(255,255,255,0.1));
      color: var(--text);
      border-radius: 8px;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.15s, transform 0.1s;
    }
    .icon-btn:hover { background: rgba(255,255,255,0.1); }
    .icon-btn:active { transform: scale(0.95); }
    .icon-btn .material-icons { font-size: 17px; }
    .icon-btn--wa {
      background: #25d366; border-color: transparent; color: #fff;
    }
    .icon-btn--wa:hover { background: #1fbc59; }
    .icon-btn--pay {
      background: var(--accent, #22c55e); border-color: transparent; color: #0a0e0c;
    }
    .icon-btn--pay:hover { filter: brightness(1.1); }

    @media (max-width: 780px) {
      .res-table { font-size: 12.5px; }
      .res-table th, .res-table td { padding: 8px 10px; }
      .cell-raffle { max-width: 120px; }
    }

    .transfer-list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s-3); }
    .transfer {
      padding: var(--s-3);
      background: var(--bg-input);
      border-radius: var(--r-md);
      border-left: 3px solid var(--warning);
    }
    .transfer__head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--s-2); }
    .transfer__head strong { display: block; }
    .transfer__head small { color: var(--text-muted); font-size: 12px; }
    .transfer__amount { font-size: 18px; font-weight: 700; }
    .transfer__meta { display: flex; gap: 6px; font-size: 12px; color: var(--text-muted); margin-bottom: var(--s-2); flex-wrap: wrap; }
    .proof { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-size: 12px; margin-bottom: var(--s-2); }
    .transfer__cta { display: flex; gap: var(--s-2); justify-content: flex-end; }
  `],
})
export class PublicSalesConfigComponent implements OnInit {
  private readonly svc = inject(PublicSalesAdminService);
  private readonly raffleSvc = inject(RaffleService);
  private readonly toast = inject(ToastService);

  wompiConfig = signal<WompiConfig | null>(null);
  raffles = signal<Raffle[]>([]);
  transfers = signal<ManualTransferSubmission[]>([]);
  reservations = signal<ActiveReservation[]>([]);
  onlyScheduled = false;
  loadingRaffles = signal(true);
  savingWompi = signal(false);

  wompiForm: WompiConfigInput = {
    env: 'sandbox',
    public_key: '',
    private_key: '',
    webhook_secret: '',
    integrity_key: '',
  };

  reservationSearch = signal('');
  filteredReservations = computed(() => {
    const q = this.reservationSearch().trim().toLowerCase();
    const list = this.reservations();
    if (!q) return list;
    return list.filter((r) => {
      const bag = [
        r.customer_name,
        r.customer_email,
        r.customer_phone,
        r.customer_document,
        r.raffle_name,
        ...r.ticket_labels,
      ].filter(Boolean).join(' ').toLowerCase();
      return bag.includes(q);
    });
  });

  markPaidTarget = signal<ActiveReservation | null>(null);
  markingPaid = signal(false);
  markPaidError = signal<string | null>(null);
  markPaidForm: {
    amount: number | null;
    payment_method: 'NEQUI' | 'DAVIPLATA' | 'BANCOLOMBIA_TRANSFER' | 'EFECTIVO' | 'OTHER';
    reference: string;
    notes: string;
  } = {
    amount: null,
    payment_method: 'NEQUI',
    reference: '',
    notes: '',
  };

  ngOnInit(): void {
    this.svc.getWompiConfig().subscribe({
      next: (w) => {
        this.wompiConfig.set(w);
        this.wompiForm.env = w.env;
        this.wompiForm.public_key = w.public_key;
      },
      error: () => {},
    });

    this.raffleSvc.list().subscribe({
      next: (r) => { this.raffles.set(r); this.loadingRaffles.set(false); },
      error: () => this.loadingRaffles.set(false),
    });

    this.loadTransfers();
    this.loadReservations();
  }

  loadTransfers() {
    this.svc.listManualTransfers().subscribe({
      next: (list) => this.transfers.set(list),
      error: () => {},
    });
  }

  loadReservations() {
    this.svc.listActiveReservations({ onlyScheduled: this.onlyScheduled }).subscribe({
      next: (list) => this.reservations.set(list),
      error: () => {},
    });
  }

  /** Mensaje pre-cargado para el WhatsApp del cliente. El admin puede
   *  editarlo antes de enviar. */
  whatsappLink(r: ActiveReservation): string {
    const phone = (r.customer_phone || '').replace(/[^0-9]/g, '');
    const normalized = phone.startsWith('57') ? phone : `57${phone}`;
    const total = r.ticket_price * r.ticket_labels.length;
    const paid = r.paid_amount || 0;
    const pending = Math.max(0, total - paid);
    const fmt = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
    const firstName = (r.customer_name || '').trim().split(/\s+/)[0] || '';
    const boletas = r.ticket_labels.join(', ');
    const deadline = r.scheduled_payment_date
      ? `el ${this.formatDate(r.scheduled_payment_date)}`
      : `antes de ${this.formatDate(r.expires_at)}`;

    const montoLine = paid > 0
      ? `💰 Total: $${fmt(total)}\n✅ Ya abonaste: $${fmt(paid)}\n🔸 Te falta: $${fmt(pending)}`
      : `💰 Total a pagar: $${fmt(total)}`;

    const msg =
`¡Hola ${firstName}! 👋

Te escribo para recordarte que tienes reservada(s) la(s) boleta(s) ${boletas} de la rifa "${r.raffle_name}".

${montoLine}
📅 Fecha límite para pagar: ${deadline}

📲 Puedes transferir a:
Nequi: 3207345154
(a nombre de Deimer Romero)

Cuando hagas el pago (total o abono), envíame el comprobante por aquí para confirmarlo. ¡Gracias! 🙌`;

    return `https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`;
  }

  openMarkPaid(r: ActiveReservation) {
    this.markPaidTarget.set(r);
    this.markPaidError.set(null);
    this.markPaidForm = {
      amount: this.remainingFor(r),
      payment_method: 'NEQUI',
      reference: '',
      notes: '',
    };
  }

  remainingFor(r: ActiveReservation): number {
    const total = r.ticket_price * r.ticket_labels.length;
    return Math.max(0, total - (r.paid_amount || 0));
  }

  closeMarkPaid() {
    if (this.markingPaid()) return;
    this.markPaidTarget.set(null);
    this.markPaidError.set(null);
  }

  submitMarkPaid() {
    const target = this.markPaidTarget();
    if (!target || this.markingPaid()) return;
    const amount = Number(this.markPaidForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      this.markPaidError.set('El monto debe ser mayor a 0.');
      return;
    }
    this.markingPaid.set(true);
    this.markPaidError.set(null);
    this.svc.markReservationsPaid({
      reservation_ids: target.reservation_ids,
      amount,
      payment_method: this.markPaidForm.payment_method,
      reference: this.markPaidForm.reference.trim() || null,
      notes: this.markPaidForm.notes.trim() || null,
    }).subscribe({
      next: (resp) => {
        this.markingPaid.set(false);
        this.markPaidTarget.set(null);
        if (resp.fully_paid) {
          this.toast.success(
            'Pago completo',
            `Boletas ${resp.ticket_labels.join(', ')} marcadas como pagadas.`,
          );
        } else {
          const falta = resp.total_expected - resp.new_paid_total;
          this.toast.success(
            'Abono registrado',
            `Total abonado: $${this.formatNumber(resp.new_paid_total)} de $${this.formatNumber(resp.total_expected)}. Falta $${this.formatNumber(falta)}.`,
          );
        }
        this.loadReservations();
      },
      error: (e) => {
        this.markingPaid.set(false);
        this.markPaidError.set(e?.error?.detail ?? 'No se pudo registrar el pago.');
      },
    });
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  formatDateShort(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  }

  saveWompi() {
    if (this.savingWompi()) return;
    if (!this.wompiForm.public_key || !this.wompiForm.private_key || !this.wompiForm.webhook_secret || !this.wompiForm.integrity_key) {
      this.toast.error('Faltan campos', 'Completa las 4 llaves de Wompi.');
      return;
    }
    this.savingWompi.set(true);
    this.svc.updateWompiConfig(this.wompiForm).subscribe({
      next: (w) => {
        this.wompiConfig.set(w);
        this.savingWompi.set(false);
        // Limpiar campos de secret (ya se guardaron)
        this.wompiForm.private_key = '';
        this.wompiForm.webhook_secret = '';
        this.wompiForm.integrity_key = '';
        this.toast.success('Guardado', 'Credenciales Wompi actualizadas.');
      },
      error: (e) => {
        this.savingWompi.set(false);
        this.toast.error('Error', e?.error?.detail ?? 'No se pudo guardar.');
      },
    });
  }

  toggleRaffle(raffle: Raffle, field: string, value: boolean) {
    const payload: any = { [field]: value };
    this.svc.updateRafflePublicConfig(raffle.id, payload).subscribe({
      next: () => {
        // Actualiza local
        this.raffles.update((list) => list.map((r) => r.id === raffle.id ? { ...r, [field]: value } as any : r));
        this.toast.success('Actualizado', `${raffle.name}: ${field} = ${value}`);
      },
      error: (e) => {
        this.toast.error('Error', e?.error?.detail ?? 'No se pudo actualizar.');
        // Recarga estado
        this.raffleSvc.list().subscribe((r) => this.raffles.set(r));
      },
    });
  }

  reviewTransfer(t: ManualTransferSubmission, approve: boolean) {
    const label = approve ? 'aprobar' : 'rechazar';
    if (!confirm(`¿Confirmas ${label} esta transferencia por $${this.formatNumber(t.amount_declared)}?`)) return;

    const notes = approve ? undefined : (prompt('Motivo del rechazo (opcional):') || undefined);

    this.svc.reviewTransfer(t.id, approve, notes).subscribe({
      next: () => {
        this.toast.success(approve ? 'Aprobado' : 'Rechazado', `Transferencia procesada.`);
        this.loadTransfers();
      },
      error: (e) => {
        this.toast.error('Error', e?.error?.detail ?? 'No se pudo procesar.');
      },
    });
  }

  formatNumber(n: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
  }
}
