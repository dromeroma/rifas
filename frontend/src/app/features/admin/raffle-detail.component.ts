import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { environment } from '@env/environment';
import { Prize, Raffle, Ticket, TicketStatus } from '@core/models/raffle.model';
import { RaffleStats } from '@core/models/stats.model';
import { AdminService } from '@core/services/admin.service';
import { AuthService } from '@core/services/auth.service';
import { ConfirmService } from '@core/services/confirm.service';
import { DrawWinnerResult, OpsService } from '@core/services/ops.service';
import { RaffleService } from '@core/services/raffle.service';
import { ToastService } from '@core/services/toast.service';
import { CountdownComponent } from '@shared/components/countdown/countdown.component';
import { NumberSearchComponent } from '@shared/components/number-search/number-search.component';
import {
  ButtonComponent, CardComponent, ChipComponent, InputComponent,
  KpiComponent, ModalComponent,
} from '@shared/ui';
import { TicketActionsModalComponent } from '../seller/ticket-actions-modal.component';

@Component({
  selector: 'app-raffle-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule, CountdownComponent, NumberSearchComponent,
    ButtonComponent, CardComponent, ChipComponent, InputComponent,
    KpiComponent, ModalComponent,
    TicketActionsModalComponent,
  ],
  template: `
    @if (raffle(); as r) {
      <div class="page">
        <header class="page__head">
          <div>
            <h1>{{ r.name }}</h1>
            <p class="muted">
              {{ '$' + fmt(r.ticket_price) }} por boleta ·
              @if (r.commission_tiers && r.commission_tiers.length) {
                comisión escalonada
              } @else {
                comisión {{ '$' + fmt(r.seller_commission) }}
              }
              · {{ r.total_tickets }} boletas
            </p>
            @if (r.lottery_name) {
              <p class="muted">🎰 Juega con: <strong>{{ r.lottery_name }}</strong></p>
            }
          </div>
          <div class="page__actions">
            <app-button variant="secondary" icon="edit" (click)="openEditModal(r)">Editar</app-button>
            @if (r.status !== 'cancelled') {
              <app-button variant="secondary" icon="event_repeat" (click)="openPostponeModal(r)">
                Aplazar
              </app-button>
              <app-button variant="secondary" icon="cancel" (click)="openCancelModal(r)">
                Cancelar
              </app-button>
            }
            <app-button variant="secondary" icon="cleaning_services" [loading]="expiring()" (click)="expireOverdue()">
              Liberar vencidas
            </app-button>
            @if (r.numbers_generated && r.status !== 'cancelled') {
              <app-button variant="secondary" icon="print" (click)="openRangePrintModal()">
                Imprimir por rango
              </app-button>
              <app-button variant="primary" icon="emoji_events" (click)="openDrawModal(r)">
                Registrar ganador
              </app-button>
            }
            @if (!r.numbers_generated && r.status !== 'cancelled') {
              <app-button variant="primary" icon="bolt" (click)="generate(r.id)" [loading]="generating()">
                {{ generating() ? 'Generando 10.000...' : 'Generar números' }}
              </app-button>
            }
          </div>

          @if (r.status === 'cancelled') {
            <div class="cancelled-banner">
              <span class="material-icons">cancel</span>
              <div>
                <strong>Esta rifa fue cancelada</strong>
                <small>La data se conserva para auditoría, pero ya no admite operaciones.</small>
              </div>
            </div>
          }
        </header>

        @if (stats(); as st) {
          <section class="hero">
            @if (st.next_draw) {
              <app-countdown
                [seconds]="st.next_draw.seconds_remaining"
                [label]="'Próximo sorteo · ' + st.next_draw.prize_name + ' · ' + st.next_draw.draw_date"
              />
            }
            @if (st.can_run_draw) {
              <app-chip tone="paid">✓ Listo para sortear</app-chip>
            } @else {
              <div class="threshold">
                <strong>Faltan {{ st.min_threshold - st.sold }}</strong>
                <small class="muted">
                  {{ st.sold }} / {{ st.min_threshold }} pagadas ·
                  {{ pct(st.threshold_progress_pct) }}%
                </small>
              </div>
            }
          </section>

          <section class="kpis">
            <app-kpi label="Pagadas"     [value]="st.sold"      icon="check_circle" tone="accent" />
            <app-kpi label="Reservadas"  [value]="st.reserved"  icon="schedule"     tone="warning" />
            <app-kpi label="Disponibles" [value]="st.available" icon="inventory_2"  tone="info" />
          </section>
        }

        <!-- Comisión escalonada (si la rifa la usa) -->
        @if (r.commission_tiers && r.commission_tiers.length) {
          <app-card title="Comisión escalonada" subtitle="Aplica al total de boletas vendidas por cada vendedor">
            <div slot="actions">
              <app-button variant="secondary" size="sm" icon="edit" (click)="openTiersModal(r)">
                Editar tramos
              </app-button>
            </div>
            <div class="tiers-grid">
              @for (t of r.commission_tiers; track t.from_count) {
                <div class="tier-pill">
                  <small class="muted">
                    @if (t.to_count != null) {
                      {{ t.from_count }} – {{ t.to_count }} boletas
                    } @else {
                      {{ t.from_count }}+ boletas
                    }
                  </small>
                  <strong>{{ '$' + fmt(t.amount_per_ticket) }} <span class="muted">/ boleta</span></strong>
                </div>
              }
            </div>
            <p class="muted" style="margin-top: var(--s-2); font-size: 12px;">
              💡 Tier calificador: si un vendedor alcanza un tramo, ese monto aplica a TODAS sus boletas vendidas (no marginal).
            </p>
          </app-card>
        }

        <!-- Modal de edición de tramos -->
        <app-modal
          [open]="tiersModalOpen()"
          title="Editar tramos de comisión"
          subtitle="Cambia los topes y los montos por boleta. Afecta los cálculos futuros."
          icon="stairs"
          size="md"
          (close)="closeTiersModal()"
        >
          <form class="tiers-form" (ngSubmit)="$event.preventDefault(); saveTiers()">
            @for (t of tiersEdit; track $index; let i = $index; let last = $last) {
              <div class="tier-edit-row">
                <div class="tier-edit-range">
                  <app-input label="Desde (boletas)" type="number" inputmode="numeric"
                              [ngModel]="t.from_count"
                              (ngModelChange)="updateTierFromAt(i, $event)"
                              [name]="'tedit_from_' + i" icon="south" />
                  @if (!last) {
                    <app-input label="Hasta (boletas)" type="number" inputmode="numeric"
                                [ngModel]="t.to_count"
                                (ngModelChange)="updateTierToAt(i, $event)"
                                [name]="'tedit_to_' + i" icon="north" />
                  } @else {
                    <div class="tier-edit-open">
                      <span class="material-icons">all_inclusive</span>
                      <span>Sin límite superior</span>
                    </div>
                  }
                </div>
                <app-input label="Pesos por boleta (COP)" type="number" inputmode="numeric"
                            [(ngModel)]="t.amount_per_ticket"
                            [name]="'tedit_amt_' + i" icon="payments" />
                @if (tiersEdit.length > 1) {
                  <button type="button" class="tier-edit-del" (click)="removeTierAt(i)" aria-label="Eliminar">
                    <span class="material-icons">close</span>
                  </button>
                }
              </div>
            }
            <app-button variant="secondary" size="sm" icon="add" (click)="addTierRow()">
              Agregar tramo
            </app-button>

            @if (tiersError()) {
              <div class="alert">
                <span class="material-icons">error_outline</span>{{ tiersError() }}
              </div>
            }

            <div class="tiers-warn">
              <span class="material-icons">info</span>
              <span>
                Los cambios afectan los cálculos a partir del próximo pago confirmado.
                Las comisiones ya generadas no se modifican retroactivamente.
              </span>
            </div>
          </form>

          <ng-container slot="footer">
            <app-button variant="secondary" (click)="closeTiersModal()">Cancelar</app-button>
            <app-button variant="primary" icon="check" [loading]="savingTiers()" (click)="saveTiers()">
              {{ savingTiers() ? 'Guardando...' : 'Guardar tramos' }}
            </app-button>
          </ng-container>
        </app-modal>

        <!-- ============ MODAL: Imprimir boletas por rango ============ -->
        <app-modal
          [open]="rangePrintOpen()"
          title="Imprimir boletas por rango"
          subtitle="Imprime un sub-lote arbitrario (sin importar a qué vendedor estén asignadas)."
          icon="print"
          size="sm"
          (close)="closeRangePrintModal()"
        >
          <form class="range-form" (ngSubmit)="$event.preventDefault(); submitRangePrint()">
            <div class="range-form__row">
              <label class="field">
                <span>Desde</span>
                <input type="number" min="1" [max]="r.total_tickets"
                       [(ngModel)]="rangeFrom" name="from"
                       inputmode="numeric" placeholder="001" />
              </label>
              <label class="field">
                <span>Hasta</span>
                <input type="number" min="1" [max]="r.total_tickets"
                       [(ngModel)]="rangeTo" name="to"
                       inputmode="numeric" placeholder="050" />
              </label>
            </div>

            <!-- Selector de diseño dentro del modal: el usuario debe elegir
                 ANTES de descargar porque el auto-download de la página de
                 impresión arranca de inmediato y no le da tiempo de cambiarlo
                 desde la toolbar de esa página. -->
            <div class="range-form__design">
              <span class="range-form__design-label">Diseño de la boleta</span>
              <div class="range-form__design-opts">
                <button type="button"
                        class="range-form__design-opt"
                        [class.range-form__design-opt--on]="rangeDesign() === 'soccer'"
                        (click)="rangeDesign.set('soccer')">
                  <span class="material-icons">sports_soccer</span>
                  Cancha
                </button>
                <button type="button"
                        class="range-form__design-opt"
                        [class.range-form__design-opt--on]="rangeDesign() === 'professional'"
                        (click)="rangeDesign.set('professional')">
                  <span class="material-icons">workspace_premium</span>
                  Profesional
                </button>
              </div>
            </div>

            <small class="muted">
              Total disponible: <strong>{{ r.total_tickets }}</strong> boletas
              (de 001 a {{ r.total_tickets }}).
            </small>
            @if (rangeError()) {
              <div class="alert">
                <span class="material-icons">error_outline</span>
                {{ rangeError() }}
              </div>
            }
          </form>

          <ng-container slot="footer">
            <app-button variant="secondary" (click)="closeRangePrintModal()">Cancelar</app-button>
            <app-button variant="primary" icon="print" (click)="submitRangePrint()">
              Imprimir rango
            </app-button>
          </ng-container>
        </app-modal>

        <!-- Premios y fechas de sorteo -->
        <app-card title="Premios" [subtitle]="r.prizes.length + ' premio(s) configurados'">
          <div slot="actions">
            <app-button variant="secondary" size="sm" icon="add" (click)="openPrizeModal()">
              Agregar premio
            </app-button>
          </div>

          @if (!r.prizes.length) {
            <p class="muted">Aún no hay premios. Empieza agregando el premio mayor.</p>
          } @else {
            <ul class="prizes-list">
              @for (p of sortedPrizes(); track p.id) {
                <li class="prize-item">
                  <div class="prize-item__icon">
                    @if (p.position === 1) {
                      <span class="material-icons">military_tech</span>
                    } @else {
                      <span class="material-icons">workspace_premium</span>
                    }
                  </div>
                  <div class="prize-item__body">
                    <strong>#{{ p.position }} · {{ p.name }}</strong>
                    <small class="muted">
                      Sorteo: <strong>{{ p.draw_date }}</strong>
                      @if (p.estimated_value) { · valor estimado: {{ '$' + fmt(p.estimated_value) }} }
                      @if (p.winning_number) {
                        · <span class="prize-won">ganador: {{ p.winning_number }}</span>
                      }
                    </small>
                    @if (p.description) {
                      <small class="muted prize-item__desc">{{ p.description }}</small>
                    }
                  </div>
                  <div class="prize-item__actions">
                    <button type="button" class="icon-btn" (click)="openPrizeModal(p)"
                            [disabled]="!!p.winning_number && p.position === 1"
                            [attr.aria-label]="'Editar premio ' + p.position"
                            title="Editar premio">
                      <span class="material-icons">edit</span>
                    </button>
                    <button type="button" class="icon-btn icon-btn--danger"
                            [disabled]="!!p.winning_number"
                            [attr.aria-label]="'Eliminar premio ' + p.position"
                            title="Eliminar premio"
                            (click)="deletePrize(p)">
                      <span class="material-icons">delete_outline</span>
                    </button>
                  </div>
                </li>
              }
            </ul>
          }
        </app-card>

        @if (selectedTicket()) {
          <app-ticket-actions-modal
            [open]="modalOpen()"
            [ticket]="selectedTicket()"
            [raffle]="r"
            (close)="closeModal()"
            (changed)="onTicketChanged($event)"
          />
        }

        @if (r.numbers_generated) {
          <app-number-search
            [raffleId]="r.id"
            title="¿Qué boleta tiene un número?"
            subtitle="Útil cuando un cliente pide una boleta con cierto número, o cuando sale el ganador.">
          </app-number-search>
        }

        <app-card title="Boletas" [subtitle]="filteredTickets().length + ' resultados'">
          <div slot="actions">
            <select class="select" [(ngModel)]="filter">
              <option value="">Todos</option>
              <option value="available">Disponibles</option>
              <option value="reserved">Reservadas</option>
              <option value="pending_payment">Pendiente pago</option>
              <option value="partially_paid">Pago parcial</option>
              <option value="paid">Pagadas</option>
              <option value="winning">Ganadoras</option>
            </select>
            <input class="input" placeholder="Buscar..." [(ngModel)]="query" />
          </div>

          <!-- Leyenda de colores -->
          <div class="legend">
            <span class="legend__item"><span class="dot dot--available"></span>Disponible</span>
            <span class="legend__item"><span class="dot dot--assigned"></span>Asignada a vendedor</span>
            <span class="legend__item"><span class="dot dot--reserved"></span>Reservada</span>
            <span class="legend__item"><span class="dot dot--pending_payment"></span>Pendiente pago</span>
            <span class="legend__item"><span class="dot dot--partially_paid"></span>Pago parcial</span>
            <span class="legend__item"><span class="dot dot--paid"></span>Pagada</span>
            <span class="legend__item"><span class="dot dot--winning"></span>Ganadora</span>
            <span class="legend__item"><span class="dot dot--expired"></span>Expirada</span>
          </div>

          <div class="ticket-grid">
            @for (t of filteredTickets(); track t.id) {
              <button class="t-btn t-btn--{{ t.status }}"
                      [class.t-btn--assigned]="t.status === 'available' && t.seller_id"
                      (click)="preview(t.id)"
                      [title]="t.status === 'available' && t.seller_id ? 'Asignada a vendedor' : t.status">
                {{ t.number_label }}
              </button>
            }
          </div>
        </app-card>
      </div>

      <!-- ============ APLAZAR RIFA ============ -->
      <app-modal
        [open]="postponeOpen()"
        title="Aplazar rifa"
        subtitle="Cambia la fecha del sorteo final. Avisaremos a los clientes con boleta pagada."
        size="md"
        (close)="closePostponeModal()"
      >
        <form class="edit-form">
          <app-input label="Nueva fecha de sorteo final *" type="date"
                      [(ngModel)]="postpone.new_final_draw_date" name="postpone_date"
                      icon="event" />
          <label class="textarea-field">
            <span>Motivo (opcional, se incluye en el email a clientes)</span>
            <textarea rows="3" [(ngModel)]="postpone.reason" name="postpone_reason"
                      placeholder="Ej: 'No alcanzamos el 90% de venta. Damos 30 días más para que todos puedan participar.'"></textarea>
          </label>
          <p class="muted" style="font-size:12px;">
            Las boletas pagadas siguen activas con sus mismos números. No se genera reembolso.
          </p>
        </form>
        <ng-container slot="footer">
          <app-button variant="secondary" (click)="closePostponeModal()">Cancelar</app-button>
          <app-button variant="primary" icon="event_repeat" [loading]="postponing()" (click)="doPostpone()">
            {{ postponing() ? 'Aplazando...' : 'Aplazar rifa' }}
          </app-button>
        </ng-container>
      </app-modal>

      <!-- ============ CANCELAR RIFA ============ -->
      <app-modal
        [open]="cancelOpen()"
        title="Cancelar rifa"
        subtitle="Acción definitiva. Se notificará a cada cliente pagado con un email empático y proceso de reembolso."
        size="md"
        (close)="closeCancelModal()"
      >
        <form class="edit-form">
          <label class="textarea-field">
            <span>Motivo de la cancelación * (visible al cliente)</span>
            <textarea rows="3" [(ngModel)]="cancelData.reason" name="cancel_reason"
                      placeholder="Ej: 'Por circunstancias ajenas, no alcanzamos el mínimo de venta para garantizar los premios.'"></textarea>
          </label>
          <app-input label="Datos para reembolso (opcional)"
                      [(ngModel)]="cancelData.refund_contact" name="cancel_refund_contact"
                      icon="account_balance_wallet"
                      hint="Ej: 'Nequi 3001234567 · Bancolombia 12345-67890'." />
          <label class="textarea-field">
            <span>Mensaje personalizado sobre el reembolso (opcional)</span>
            <textarea rows="3" [(ngModel)]="cancelData.refund_message" name="cancel_refund_message"
                      placeholder="Déjalo vacío para usar el mensaje genérico. Si lo escribes, reemplaza el texto por defecto en el email."></textarea>
          </label>
          <div class="warn-card">
            <span class="material-icons">warning</span>
            <div>
              <strong>Esto es definitivo.</strong>
              <small>La rifa quedará marcada como CANCELADA. La data se conserva para auditoría pero ya no podrás operar sobre ella.</small>
            </div>
          </div>
        </form>
        <ng-container slot="footer">
          <app-button variant="secondary" (click)="closeCancelModal()">Volver</app-button>
          <app-button variant="danger" icon="cancel" [loading]="cancelling()" (click)="doCancel()">
            {{ cancelling() ? 'Cancelando...' : 'Sí, cancelar rifa' }}
          </app-button>
        </ng-container>
      </app-modal>

      <!-- ============ REGISTRAR GANADOR ============ -->
      <app-modal
        [open]="drawOpen()"
        title="Registrar ganador del sorteo"
        subtitle="Ingresa el número que salió en la lotería para uno de los premios."
        size="md"
        (close)="closeDrawModal()"
      >
        <form class="edit-form">
          <label class="textarea-field">
            <span>Premio</span>
            <select [(ngModel)]="draw.prize_id" name="prize_id">
              @for (p of pendingPrizes(); track p.id) {
                <option [value]="p.id">{{ p.position }}. {{ p.name }} — {{ p.draw_date }}</option>
              }
            </select>
          </label>

          <app-input
            label="Número ganador"
            [(ngModel)]="draw.winning_number"
            name="winning_number"
            icon="emoji_events"
            inputmode="numeric"
            hint="Ej: 0421. Se completa con ceros a la izquierda automáticamente."
          />

          @if (drawResult(); as dr) {
            <div class="draw-result" [class.draw-result--no-paid]="!dr.is_paid">
              <strong>Boleta {{ dr.ticket_label }}</strong>
              @if (dr.customer_name) {
                <small>{{ dr.customer_name }}<br /><span class="muted">{{ dr.customer_phone }}</span></small>
              } @else {
                <small class="muted">Sin cliente asignado</small>
              }
              @if (!dr.is_paid) {
                <small class="warn">⚠ Esta boleta NO está pagada. Verifica con el cliente.</small>
              }
            </div>
          }
        </form>
        <ng-container slot="footer">
          <app-button variant="secondary" (click)="closeDrawModal()">Cerrar</app-button>
          <app-button variant="primary" icon="check" [loading]="drawing()" (click)="doDraw()">
            {{ drawing() ? 'Registrando...' : 'Registrar ganador' }}
          </app-button>
        </ng-container>
      </app-modal>

      <!-- ============ CREAR / EDITAR PREMIO ============ -->
      <app-modal
        [open]="prizeOpen()"
        [title]="prizeForm.id ? 'Editar premio' : 'Agregar premio'"
        [subtitle]="prizeForm.id ? 'Cambia los datos del premio y/o la fecha de sorteo.' : 'Crea un premio adicional con su propia fecha de sorteo.'"
        size="md"
        (close)="closePrizeModal()"
      >
        <form class="edit-form">
          <div class="form-row">
            <app-input label="Posición *" type="number" inputmode="numeric"
                        [(ngModel)]="prizeForm.position" name="prize_position"
                        icon="format_list_numbered"
                        hint="1 = premio mayor. Los demás son menores (2, 3, ...)." />
            <app-input label="Fecha de sorteo *" type="date"
                        [(ngModel)]="prizeForm.draw_date" name="prize_draw_date" icon="event" />
          </div>
          <app-input label="Nombre del premio *"
                      [(ngModel)]="prizeForm.name" name="prize_name" icon="emoji_events" />
          <app-input label="Valor estimado (COP)" type="number" inputmode="numeric"
                      [(ngModel)]="prizeForm.estimated_value" name="prize_value" icon="payments" />
          <label class="textarea-field">
            <span>Descripción (opcional)</span>
            <textarea rows="2" [(ngModel)]="prizeForm.description" name="prize_description"
                      placeholder="Detalles, marca, modelo, etc."></textarea>
          </label>
        </form>
        <ng-container slot="footer">
          <app-button variant="secondary" (click)="closePrizeModal()">Cancelar</app-button>
          <app-button variant="primary" icon="check" [loading]="savingPrize()" (click)="savePrize()">
            {{ savingPrize() ? 'Guardando...' : (prizeForm.id ? 'Guardar cambios' : 'Crear premio') }}
          </app-button>
        </ng-container>
      </app-modal>

      <!-- ============ EDITAR RIFA ============ -->
      <app-modal
        [open]="editOpen()"
        title="Editar rifa"
        subtitle="Estos datos se muestran en el QR público y en la imagen compartible."
        size="lg"
        (close)="closeEditModal()"
      >
        <form class="edit-form">
          <app-input label="Nombre de la rifa" [(ngModel)]="edit.name" name="name" icon="title" />
          <app-input label="Lotería con la que juega" [(ngModel)]="edit.lottery_name" name="lottery_name" icon="casino"
                      hint="Ej: Lotería de Bogotá, Lotería del Cauca, etc." />
          <app-input label="Umbral para sortear" type="number" inputmode="numeric"
                      [(ngModel)]="edit.min_paid_threshold" name="min_paid_threshold" icon="flag"
                      hint="Boletas pagadas mínimas para habilitar 'Registrar ganador'." />
          <div class="form-row">
            <app-input label="Responsable" [(ngModel)]="edit.responsible_name" name="responsible_name" icon="person" />
            <app-input label="Teléfono de contacto" [(ngModel)]="edit.responsible_phone" name="responsible_phone" icon="phone" inputmode="tel" />
          </div>
          <app-input label="Email de contacto" type="email" [(ngModel)]="edit.responsible_email" name="responsible_email" icon="alternate_email" />
          <app-input label="Color primario (HEX)" [(ngModel)]="edit.primary_color" name="primary_color" icon="palette"
                      hint="Ej: #1e8e54 (verde). Se usa en la cancha de la boleta." />
          <label class="textarea-field">
            <span>Términos y condiciones (opcional)</span>
            <textarea rows="3" [(ngModel)]="edit.terms" name="terms"
                      placeholder="Reglas, restricciones, política de cancelación..."></textarea>
          </label>
        </form>
        <ng-container slot="footer">
          <app-button variant="secondary" (click)="closeEditModal()">Cancelar</app-button>
          <app-button variant="primary" icon="check" [loading]="savingEdit()" (click)="saveEdit()">
            {{ savingEdit() ? 'Guardando...' : 'Guardar cambios' }}
          </app-button>
        </ng-container>
      </app-modal>
    }
  `,
  styles: [`
    .page { display: grid; gap: var(--s-4); }
    .page__head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--s-3); flex-wrap: wrap; }
    .page__head h1 { font-size: 22px; }
    .page__actions { display: flex; gap: var(--s-2); flex-wrap: wrap; }

    /* Edit modal form */
    .edit-form { display: grid; gap: var(--s-3); }
    .form-row { display: grid; gap: var(--s-3); grid-template-columns: 1fr; }
    @media (min-width: 540px) { .form-row { grid-template-columns: 1fr 1fr; } }
    .textarea-field { display: grid; gap: 4px; font-size: 12px; color: var(--text-muted); }
    .textarea-field span { font-weight: 500; }
    .textarea-field textarea {
      padding: 10px 12px;
      background: var(--bg-input);
      color: var(--text);
      border: 1px solid transparent;
      border-radius: var(--r-md);
      font-family: inherit;
      font-size: 14px;
      resize: vertical;
    }
    .textarea-field textarea:focus { outline: 0; border-color: var(--accent); }

    .textarea-field select {
      padding: 10px 12px;
      background: var(--bg-input);
      color: var(--text);
      border: 1px solid transparent;
      border-radius: var(--r-md);
      font-size: 14px;
    }
    .textarea-field select:focus { outline: 0; border-color: var(--accent); }

    /* Draw result */
    .draw-result {
      display: grid; gap: 4px;
      padding: var(--s-3);
      background: var(--accent-soft);
      border: 1px solid var(--accent);
      border-radius: var(--r-md);
    }
    .draw-result strong { color: var(--accent); font-size: 18px; }
    .draw-result small { font-size: 12px; }
    .draw-result .warn { color: var(--warning); font-weight: 600; margin-top: 6px; }
    .draw-result--no-paid {
      background: var(--warning-soft);
      border-color: var(--warning);
    }
    .draw-result--no-paid strong { color: var(--warning); }
    .muted { color: var(--text-muted); font-size: 13px; margin-top: 2px; }

    .hero {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-xl);
      padding: var(--s-5);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--s-4);
    }
    .threshold { display: grid; gap: 2px; text-align: right; }
    .threshold strong { font-size: 18px; color: var(--warning); }

    .kpis {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--s-3);
    }
    @media (max-width: 600px) { .kpis { grid-template-columns: 1fr; } }

    .tiers-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: var(--s-3);
    }
    .tier-pill {
      display: grid;
      gap: 4px;
      padding: var(--s-3);
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      text-align: center;
    }
    .tier-pill strong {
      color: var(--accent);
      font-size: 16px;
      font-variant-numeric: tabular-nums;
    }
    .tier-pill strong .muted { color: var(--text-muted); font-weight: 400; font-size: 12px; }

    /* ===== Modal Imprimir por rango ===== */
    .range-form { display: grid; gap: var(--s-3); }
    .range-form__row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--s-3);
    }
    .range-form .field { display: grid; gap: 6px; }
    .range-form .field span {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .range-form .field input {
      height: var(--h-input);
      padding: 0 var(--s-3);
      background: var(--bg-input);
      border: 1px solid transparent;
      color: var(--text);
      border-radius: var(--r-md);
      font-size: 18px;
      font-weight: 700;
      font-family: 'Inter', monospace;
      text-align: center;
      letter-spacing: 0.06em;
    }
    .range-form .field input:focus { outline: 0; border-color: var(--accent); }
    .range-form .muted { font-size: 12px; color: var(--text-muted); }

    /* Selector de diseño dentro del modal — el usuario elige cancha o
       profesional ANTES de iniciar la descarga, evitando race conditions
       con el auto-download que arranca apenas la página de impresión carga. */
    .range-form__design { display: grid; gap: 8px; }
    .range-form__design-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .range-form__design-opts {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--s-2);
    }
    .range-form__design-opt {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: var(--h-input);
      padding: 0 var(--s-3);
      background: var(--bg-input);
      border: 1px solid transparent;
      color: var(--text-muted);
      border-radius: var(--r-md);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .range-form__design-opt:hover {
      background: rgba(255, 255, 255, 0.04);
      color: var(--text);
    }
    .range-form__design-opt .material-icons { font-size: 18px; }
    .range-form__design-opt--on {
      background: var(--accent);
      color: #0a0e0c;
      border-color: var(--accent);
    }
    .range-form__design-opt--on:hover {
      background: var(--accent);
      color: #0a0e0c;
    }
    .range-form .alert {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: var(--s-3);
      background: var(--danger-soft);
      color: var(--danger);
      border-radius: var(--r-md);
      font-size: 13px;
    }

    /* ===== Modal Editar tramos ===== */
    .tiers-form { display: grid; gap: var(--s-3); }
    .tier-edit-row {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: var(--s-3);
      align-items: end;
      padding: var(--s-3);
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
    }
    .tier-edit-range { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
    .tier-edit-open {
      display: flex; align-items: center; gap: 6px;
      color: var(--text-muted); font-size: 12px;
      padding: 0 var(--s-3);
      height: var(--h-input);
    }
    .tier-edit-open .material-icons { font-size: 18px; }
    .tier-edit-del {
      width: 36px; height: 36px;
      display: grid; place-items: center;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-muted);
      border-radius: var(--r-md);
      cursor: pointer;
    }
    .tier-edit-del:hover { color: var(--danger); border-color: var(--danger); background: var(--danger-soft); }
    .tier-edit-del .material-icons { font-size: 18px; }

    .tiers-warn {
      display: flex; gap: 8px; align-items: flex-start;
      padding: var(--s-3);
      background: var(--info-soft); color: var(--info);
      border-radius: var(--r-md);
      font-size: 13px;
    }
    .tiers-warn .material-icons { font-size: 18px; flex-shrink: 0; margin-top: 1px; }

    @media (max-width: 540px) {
      .tier-edit-row { grid-template-columns: 1fr; }
      .tier-edit-range { grid-template-columns: 1fr 1fr; }
    }

    .prizes-list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s-2); }
    .prize-item {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: var(--s-3);
      align-items: center;
      padding: var(--s-3);
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
    }
    .prize-item__icon {
      width: 36px; height: 36px;
      background: var(--accent-soft);
      color: var(--accent);
      border-radius: 50%;
      display: grid; place-items: center;
    }
    .prize-item__icon .material-icons { font-size: 22px; }
    .prize-item__body { display: grid; gap: 2px; min-width: 0; }
    .prize-item__body strong { font-size: 14px; color: var(--text); }
    .prize-item__body small { font-size: 12px; line-height: 1.4; }
    .prize-item__desc { font-style: italic; }
    .prize-won { color: #f5b400; font-weight: 700; }
    .prize-item__actions { display: flex; gap: 4px; }
    .icon-btn {
      width: 32px; height: 32px;
      background: transparent; border: 0; border-radius: var(--r-sm);
      color: var(--text-muted);
      cursor: pointer;
      display: grid; place-items: center;
    }
    .icon-btn:hover { background: var(--bg-hover); color: var(--text); }
    .icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .icon-btn:disabled:hover { background: transparent; color: var(--text-muted); }
    .icon-btn--danger:hover { background: var(--danger-soft); color: var(--danger); }
    .icon-btn .material-icons { font-size: 18px; }

    .cancelled-banner {
      display: flex; align-items: center; gap: var(--s-3);
      padding: var(--s-3) var(--s-4);
      background: var(--danger-soft); color: var(--danger);
      border-radius: var(--r-md);
      border: 1px solid var(--danger);
    }
    .cancelled-banner .material-icons { font-size: 28px; }
    .cancelled-banner strong { display: block; font-size: 14px; }
    .cancelled-banner small { display: block; font-size: 12px; opacity: 0.9; }

    .warn-card {
      display: flex; gap: var(--s-2); align-items: flex-start;
      padding: var(--s-3);
      background: var(--warning-soft); color: var(--warning);
      border-radius: var(--r-md);
      border: 1px solid var(--warning);
    }
    .warn-card .material-icons { font-size: 20px; flex-shrink: 0; }
    .warn-card strong { display: block; font-size: 13px; }
    .warn-card small { display: block; font-size: 12px; opacity: 0.9; }

    .preview { display: grid; gap: var(--s-3); justify-items: start; }
    .preview__actions { display: flex; gap: 8px; }

    .select, .input {
      background: var(--bg-input);
      border: 1px solid transparent;
      color: var(--text);
      padding: 8px 10px;
      border-radius: var(--r-md);
      font-size: 13px;
    }
    .select:focus, .input:focus { outline: 0; border-color: var(--accent); }

    /* ============ Leyenda ============ */
    .legend {
      display: flex; flex-wrap: wrap; gap: var(--s-3);
      padding: var(--s-3);
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      margin-bottom: var(--s-3);
      font-size: 12px;
      color: var(--text-muted);
    }
    .legend__item { display: inline-flex; align-items: center; gap: 6px; }
    .dot {
      width: 12px; height: 12px;
      border-radius: 4px;
      border: 1px solid currentColor;
      flex-shrink: 0;
    }
    .dot--available       { background: var(--bg-base); color: var(--text-faint); }
    .dot--assigned        { background: #a78bfa; color: #a78bfa; border-color: #a78bfa; }
    .dot--reserved        { background: var(--warning); color: var(--warning); border-color: var(--warning); }
    .dot--pending_payment { background: repeating-linear-gradient(45deg, var(--warning) 0 4px, var(--bg-base) 4px 8px); color: var(--warning); border-color: var(--warning); }
    .dot--partially_paid  { background: var(--info); color: var(--info); border-color: var(--info); }
    .dot--paid            { background: var(--accent);  color: var(--accent);  border-color: var(--accent); }
    .dot--winning         { background: #f5b400; color: #f5b400; border-color: #f5b400; }
    .dot--expired         { background: var(--danger);  color: var(--danger);  border-color: var(--danger); opacity: 0.5; }

    /* ============ Grilla de boletas ============ */
    .ticket-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
      gap: 6px;
    }
    .t-btn {
      position: relative;
      padding: 10px 0;
      border-radius: var(--r-sm);
      border: 1.5px solid var(--border);
      background: var(--bg-base);
      color: var(--text);
      font-weight: 700;
      cursor: pointer;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      transition: transform var(--t-fast), border-color var(--t-fast), box-shadow var(--t-fast);
    }
    .t-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 10px rgba(0,0,0,0.25);
    }
    .t-btn:active { transform: translateY(0); }

    /* Disponible: visible pero neutro */
    .t-btn--available {
      background: var(--bg-base);
      color: var(--text);
      border-color: var(--border);
    }
    .t-btn--available:hover { border-color: var(--accent); color: var(--accent); }

    /* Asignada: boleta libre pero ya tiene seller_id (rango asignado).
       Color lavanda suave para distinguirla de las totalmente libres
       sin gritar visualmente. */
    .t-btn--assigned {
      background: rgba(167, 139, 250, 0.12);
      border-color: rgba(167, 139, 250, 0.5);
      color: #a78bfa;
    }
    .t-btn--assigned:hover {
      background: rgba(167, 139, 250, 0.22);
      border-color: #a78bfa;
      color: #a78bfa;
    }

    /* Reservada: amarillo sólido */
    .t-btn--reserved {
      background: var(--warning);
      color: #1f1500;
      border-color: var(--warning);
    }

    /* Pendiente pago: amarillo rayado (claramente distinto de reservada) */
    .t-btn--pending_payment {
      background:
        repeating-linear-gradient(
          45deg,
          var(--warning) 0 6px,
          color-mix(in srgb, var(--warning) 60%, transparent) 6px 12px
        );
      color: #1f1500;
      border-color: var(--warning);
    }

    /* Pago parcial: azul (cuotas en progreso) */
    .t-btn--partially_paid {
      background: var(--info);
      color: #fff;
      border-color: var(--info);
    }

    /* Pagada: verde sólido (es el éxito) */
    .t-btn--paid {
      background: var(--accent);
      color: var(--accent-fg);
      border-color: var(--accent);
    }

    /* Ganadora: dorado */
    .t-btn--winning {
      background: #f5b400;
      color: #1f1500;
      border-color: #f5b400;
      box-shadow: 0 0 0 2px rgba(245, 180, 0, 0.25);
    }
    .t-btn--winning::after {
      content: '★';
      position: absolute;
      top: 2px; right: 4px;
      font-size: 9px;
      color: #1f1500;
    }

    /* Expirada: opaca con tachado */
    .t-btn--expired {
      opacity: 0.4;
      text-decoration: line-through;
      color: var(--danger);
      border-color: var(--danger);
    }
  `],
})
export class RaffleDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly raffleSvc = inject(RaffleService);
  private readonly admin = inject(AdminService);
  private readonly ops = inject(OpsService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly confirmSvc = inject(ConfirmService);

  raffle = signal<Raffle | null>(null);
  tickets = signal<Ticket[]>([]);
  stats = signal<RaffleStats | null>(null);
  selectedTicket = signal<Ticket | null>(null);
  modalOpen = signal(false);
  generating = signal(false);

  // Liberar vencidas
  expiring = signal(false);

  // Aplazar
  postponeOpen = signal(false);
  postponing = signal(false);
  postpone: { new_final_draw_date: string; reason: string } = {
    new_final_draw_date: '',
    reason: '',
  };

  // Cancelar
  cancelOpen = signal(false);
  cancelling = signal(false);
  cancelData: { reason: string; refund_contact: string; refund_message: string } = {
    reason: '',
    refund_contact: '',
    refund_message: '',
  };

  // Registrar ganador
  drawOpen = signal(false);
  drawing = signal(false);
  draw = { prize_id: 0, winning_number: '' };
  drawResult = signal<DrawWinnerResult | null>(null);

  // Editar tramos de comisión escalonada (post-creación)
  tiersModalOpen = signal(false);
  savingTiers = signal(false);
  tiersError = signal<string | null>(null);
  tiersEdit: { from_count: number; to_count: number | null; amount_per_ticket: number }[] = [];

  // Imprimir boletas por rango (sin importar vendedor)
  rangePrintOpen = signal(false);
  // Aunque inicializamos con string, Angular's NumberValueAccessor convierte
  // los inputs type="number" a number cuando el usuario edita. Tipamos como
  // union para que TypeScript refleje la realidad y forzemos String() en uso.
  rangeFrom: string | number = '';
  rangeTo: string | number = '';
  rangeError = signal<string | null>(null);
  // Diseño del PDF a generar: cancha (default) o profesional. Se elige en
  // el modal para que viaje como queryParam a la página de impresión —
  // así el auto-download captura el diseño correcto sin race condition.
  rangeDesign = signal<'soccer' | 'professional'>('soccer');

  // Editar rifa
  editOpen = signal(false);
  savingEdit = signal(false);
  edit: {
    name: string;
    lottery_name: string;
    min_paid_threshold: number;
    responsible_name: string;
    responsible_phone: string;
    responsible_email: string;
    primary_color: string;
    terms: string;
  } = {
    name: '', lottery_name: '', min_paid_threshold: 200,
    responsible_name: '',
    responsible_phone: '', responsible_email: '',
    primary_color: '', terms: '',
  };

  // Gestión de premios
  prizeOpen = signal(false);
  savingPrize = signal(false);
  prizeForm: {
    id: number | null;
    position: number;
    name: string;
    draw_date: string;
    estimated_value: number | null;
    description: string;
  } = this.blankPrize();

  readonly sortedPrizes = computed<Prize[]>(() => {
    const r = this.raffle();
    if (!r) return [];
    return [...r.prizes].sort((a, b) => a.position - b.position);
  });

  filter = '';
  query = '';

  readonly filteredTickets = computed(() => {
    const f = this.filter as TicketStatus | '';
    const q = this.query.trim().toLowerCase();
    return this.tickets().filter((t) => {
      if (f && t.status !== f) return false;
      if (q && !t.number_label.includes(q) && !t.code.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.load(id);
  }

  private load(id: number) {
    this.raffleSvc.get(id).subscribe((r) => {
      this.raffle.set(r);
      if (r.numbers_generated) this.admin.stats(id).subscribe((s) => this.stats.set(s));
    });
    this.raffleSvc.tickets(id).subscribe((t) => this.tickets.set(t as Ticket[]));
  }

  generate(id: number) {
    // Lee la config REAL de la rifa para evitar mostrar valores hardcoded
    // que engañen al admin (antes decía '500 / 20' sin importar la rifa).
    const r = this.raffle();
    const totalTickets = r?.total_tickets ?? 0;
    const numbersPerTicket = r?.numbers_per_ticket ?? 0;
    const totalNumbers = totalTickets * numbersPerTicket;
    const ticketsFmt = new Intl.NumberFormat('es-CO').format(totalTickets);
    const numbersFmt = new Intl.NumberFormat('es-CO').format(totalNumbers);

    this.confirmSvc.ask({
      title: 'Generar números',
      message: `Esta acción crea ${ticketsFmt} boletas con ${numbersPerTicket} números cada una (${numbersFmt} números únicos en total) y es IRREVERSIBLE. ¿Continuar?`,
      tone: 'warning',
      icon: 'bolt',
      confirmLabel: 'Sí, generar',
      cancelLabel: 'Cancelar',
    }).subscribe((yes) => {
      if (!yes) return;
      this.generating.set(true);
      this.raffleSvc.generateNumbers(id).subscribe({
        next: () => {
          this.load(id);
          this.generating.set(false);
          this.toast.success(
            'Números generados',
            `${numbersFmt} números fueron distribuidos en ${ticketsFmt} boletas sin repetir.`,
          );
        },
        error: (e) => {
          this.generating.set(false);
          this.toast.error('No se pudieron generar', e?.error?.detail ?? 'Intenta nuevamente.');
        },
      });
    });
  }

  preview(ticketId: number) {
    this.raffleSvc.ticket(ticketId).subscribe((t) => {
      this.selectedTicket.set(t);
      this.modalOpen.set(true);
    });
  }

  closeModal() { this.modalOpen.set(false); }

  onTicketChanged(updated: Ticket) {
    this.tickets.update((arr) => arr.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
    this.selectedTicket.set(updated);
    // Refrescar stats
    const r = this.raffle();
    if (r) this.admin.stats(r.id).subscribe((s) => this.stats.set(s));
  }

  pendingPrizes() {
    const r = this.raffle();
    if (!r) return [];
    return r.prizes.filter((p) => !p.winning_number);
  }

  expireOverdue() {
    this.confirmSvc.ask({
      title: 'Liberar reservas vencidas',
      message: 'Liberará automáticamente todas las reservas con más de 24 horas sin pagar. Las boletas volverán a estar disponibles.',
      tone: 'warning',
      icon: 'cleaning_services',
      confirmLabel: 'Sí, liberar',
      cancelLabel: 'Cancelar',
    }).subscribe((yes) => {
      if (!yes) return;
      this.expiring.set(true);
      this.ops.expireReservations().subscribe({
        next: (r) => {
          this.expiring.set(false);
          this.toast.success(
            r.released > 0 ? `${r.released} reservas liberadas` : 'Nada que liberar',
            r.released > 0 ? 'Las boletas vencidas ya están disponibles de nuevo.' : 'No había reservas vencidas.',
          );
          const id = this.raffle()?.id;
          if (id) this.load(id);
        },
        error: (e) => {
          this.expiring.set(false);
          this.toast.error('Error', e?.error?.detail ?? 'No se pudo liberar.');
        },
      });
    });
  }

  openDrawModal(r: Raffle) {
    const first = r.prizes.find((p) => !p.winning_number);
    this.draw = { prize_id: first?.id ?? 0, winning_number: '' };
    this.drawResult.set(null);
    this.drawOpen.set(true);
  }
  closeDrawModal() {
    this.drawOpen.set(false);
    this.drawResult.set(null);
  }

  doDraw() {
    const r = this.raffle();
    if (!r) return;
    if (!this.draw.prize_id || !this.draw.winning_number) {
      this.toast.error('Datos faltantes', 'Selecciona premio y escribe el número ganador.');
      return;
    }
    const prizeName = r.prizes.find((p) => p.id === Number(this.draw.prize_id))?.name ?? '';
    this.confirmSvc.ask({
      title: `Registrar ganador de "${prizeName}"`,
      message: `Vas a registrar el número ${this.draw.winning_number.padStart(r.number_digits, '0')} como ganador. Esta acción no se puede revertir.`,
      tone: 'warning',
      icon: 'emoji_events',
      confirmLabel: 'Sí, registrar',
      cancelLabel: 'Cancelar',
    }).subscribe((yes) => {
      if (!yes) return;
      this.drawing.set(true);
      this.ops.drawWinner(r.id, +this.draw.prize_id, this.draw.winning_number).subscribe({
        next: (result) => {
          this.drawing.set(false);
          this.drawResult.set(result);
          this.toast.success(
            `🏆 Ganador registrado: Boleta ${result.ticket_label}`,
            result.customer_name
              ? `${result.customer_name} · ${result.customer_phone}`
              : 'Boleta sin cliente asignado',
          );
          this.load(r.id);
        },
        error: (e) => {
          this.drawing.set(false);
          this.toast.error('No se pudo registrar', e?.error?.detail ?? 'Intenta de nuevo.');
        },
      });
    });
  }

  openEditModal(r: Raffle) {
    this.edit = {
      name: r.name,
      lottery_name: r.lottery_name ?? '',
      min_paid_threshold: r.min_paid_threshold ?? 200,
      responsible_name: r.responsible_name ?? '',
      responsible_phone: r.responsible_phone ?? '',
      responsible_email: r.responsible_email ?? '',
      primary_color: r.primary_color ?? '',
      terms: r.terms ?? '',
    };
    this.editOpen.set(true);
  }
  closeEditModal() { this.editOpen.set(false); }

  saveEdit() {
    const id = this.raffle()?.id;
    if (!id) return;
    if (!this.edit.min_paid_threshold || this.edit.min_paid_threshold < 1) {
      this.toast.error('Umbral inválido', 'El umbral para sortear debe ser al menos 1 boleta.');
      return;
    }
    this.savingEdit.set(true);
    const payload = {
      name: this.edit.name || undefined,
      lottery_name: this.edit.lottery_name || null,
      min_paid_threshold: Number(this.edit.min_paid_threshold),
      responsible_name: this.edit.responsible_name || null,
      responsible_phone: this.edit.responsible_phone || null,
      responsible_email: this.edit.responsible_email || null,
      primary_color: this.edit.primary_color || null,
      terms: this.edit.terms || null,
    };
    this.raffleSvc.update(id, payload).subscribe({
      next: (updated) => {
        this.raffle.set(updated);
        this.savingEdit.set(false);
        this.editOpen.set(false);
        this.toast.success('Rifa actualizada', 'Los cambios se aplicaron correctamente.');
      },
      error: (e) => {
        this.savingEdit.set(false);
        this.toast.error('No se pudo guardar', e?.error?.detail ?? 'Intenta de nuevo.');
      },
    });
  }

  // ============ Edición de tramos de comisión escalonada ============

  openTiersModal(r: Raffle) {
    // Clonamos los tramos actuales para edición; el guardado los sobreescribe.
    this.tiersEdit = (r.commission_tiers ?? []).map((t) => ({
      from_count: Number(t.from_count),
      to_count: t.to_count == null ? null : Number(t.to_count),
      amount_per_ticket: Number(t.amount_per_ticket),
    }));
    if (this.tiersEdit.length === 0) {
      this.tiersEdit.push({ from_count: 1, to_count: null, amount_per_ticket: 3000 });
    }
    // El último tramo siempre queda abierto (to_count: null).
    this.tiersEdit[this.tiersEdit.length - 1].to_count = null;
    this.tiersError.set(null);
    this.tiersModalOpen.set(true);

    // Pre-warm: dispara un ping a /health en background mientras el usuario
    // lee/edita. Para cuando le da Guardar (10-20s típicos), Render ya está
    // despierto y la PATCH responde rápido.
    fetch(`${environment.apiUrl}/health`, { method: 'GET', cache: 'no-store' })
      .catch(() => { /* fail silencioso: el retry del save lo cubre */ });
  }

  closeTiersModal() { this.tiersModalOpen.set(false); }

  /** Abre el modal de impresión por rango. Setea defaults (1 → total).
   *  No reseteamos rangeDesign — preserva la última elección del usuario
   *  entre aperturas (si imprimió profesional antes, la siguiente vez
   *  el toggle aparece ya en profesional). */
  openRangePrintModal() {
    const r = this.raffle();
    if (!r) return;
    this.rangeFrom = '001';
    this.rangeTo = String(r.total_tickets).padStart(3, '0');
    this.rangeError.set(null);
    this.rangePrintOpen.set(true);
  }
  closeRangePrintModal() { this.rangePrintOpen.set(false); }

  /** Valida el rango y navega a la página de impresión en modo range. */
  submitRangePrint() {
    const r = this.raffle();
    if (!r) return;
    // Coerción a string defensiva: Angular's NumberValueAccessor convierte
    // los inputs type="number" a número en runtime cuando el usuario edita
    // el valor. Si rangeFrom queda como number (ej. 101), llamar .trim()
    // tira TypeError y el handler se bloquea silenciosamente. Con String()
    // garantizamos que siempre sea string, sin importar el flujo.
    const from = String(this.rangeFrom ?? '').trim();
    const to = String(this.rangeTo ?? '').trim();
    if (!from || !to) {
      this.rangeError.set('Debes indicar desde y hasta.');
      return;
    }
    if (!/^\d+$/.test(from) || !/^\d+$/.test(to)) {
      this.rangeError.set('Los valores deben ser números enteros.');
      return;
    }
    const fromN = Number(from);
    const toN = Number(to);
    if (fromN < 1 || toN < 1 || fromN > r.total_tickets || toN > r.total_tickets) {
      this.rangeError.set(`El rango debe estar entre 1 y ${r.total_tickets}.`);
      return;
    }
    if (fromN > toN) {
      this.rangeError.set('"Desde" no puede ser mayor que "Hasta".');
      return;
    }
    this.rangeError.set(null);
    this.rangePrintOpen.set(false);
    // auto=download → la página de impresión auto-descarga el PDF en cuanto
    // la data + las imágenes (QRs) estén listas, sin requerir un segundo clic.
    // design=soccer|professional → el diseño elegido en el modal se aplica
    // ANTES de que arranque el auto-download, garantizando que TODAS las
    // hojas del PDF usen el mismo diseño (antes había race condition donde
    // las primeras hojas usaban el default soccer y las últimas el toggle
    // manualmente cambiado por el usuario).
    this.router.navigate(['/admin/print', r.id, 'range'], {
      queryParams: {
        from: String(fromN).padStart(3, '0'),
        to: String(toN).padStart(3, '0'),
        design: this.rangeDesign(),
        auto: 'download',
      },
    });
  }

  addTierRow() {
    const last = this.tiersEdit[this.tiersEdit.length - 1];
    if (last) {
      const lastFrom = Number(last.from_count) || 1;
      const lastTo = last.to_count != null ? Number(last.to_count) : lastFrom + 19;
      last.to_count = lastTo;
      this.tiersEdit.push({
        from_count: lastTo + 1,
        to_count: null,
        amount_per_ticket: Number(last.amount_per_ticket) + 1000,
      });
    } else {
      this.tiersEdit.push({ from_count: 1, to_count: null, amount_per_ticket: 3000 });
    }
  }

  removeTierAt(i: number) {
    this.tiersEdit.splice(i, 1);
    if (this.tiersEdit.length) {
      this.tiersEdit[this.tiersEdit.length - 1].to_count = null;
    }
  }

  updateTierFromAt(i: number, value: number) {
    this.tiersEdit[i].from_count = Number(value) || 0;
  }

  updateTierToAt(i: number, value: number | null) {
    this.tiersEdit[i].to_count = value == null ? null : (Number(value) || 0);
  }

  private validateTiersForm(): string | null {
    if (!this.tiersEdit.length) return 'Debe haber al menos un tramo.';
    // Regla del backend: el primer tramo SIEMPRE arranca en 1 (cubre desde la
    // primera boleta vendida; no puede haber huecos al inicio).
    if (this.tiersEdit[0].from_count !== 1) {
      return 'El primer tramo debe arrancar en "Desde = 1". No puede haber boletas sin tramo.';
    }
    for (let i = 0; i < this.tiersEdit.length; i++) {
      const t = this.tiersEdit[i];
      if (!t.from_count || t.from_count < 1) {
        return `Tramo ${i + 1}: "Desde" debe ser al menos 1.`;
      }
      if (i < this.tiersEdit.length - 1 && (t.to_count == null || t.to_count < t.from_count)) {
        return `Tramo ${i + 1}: "Hasta" debe ser mayor o igual a "Desde".`;
      }
      if (t.amount_per_ticket == null || t.amount_per_ticket < 0) {
        return `Tramo ${i + 1}: el monto por boleta debe ser ≥ 0.`;
      }
      if (i > 0) {
        const prev = this.tiersEdit[i - 1];
        if (prev.to_count != null && t.from_count !== prev.to_count + 1) {
          return `Tramo ${i + 1}: debe arrancar en ${prev.to_count + 1} para no dejar gaps.`;
        }
      }
    }
    return null;
  }

  /** Extrae un mensaje legible de un error HTTP que puede traer detail como
   *  string, array (formato Pydantic 422) o estructura arbitraria.
   *  Loggea a consola el error completo para facilitar diagnóstico. */
  private extractErrorMessage(e: any): string {
    // Log completo a consola (DevTools → Console) para diagnóstico.
    console.error('[saveTiers] error completo:', e);

    // Si no hubo respuesta del servidor (timeout, CORS, red caída).
    if (e?.status === 0) {
      return 'Sin conexión con el servidor. ¿Está el backend dormido o caído?';
    }

    const detail = e?.error?.detail;
    if (detail) {
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail)) {
        const msgs = detail
          .map((d: any) => {
            const msg = d?.msg || d?.message || '';
            return String(msg).replace(/^Value error,\s*/i, '');
          })
          .filter(Boolean);
        if (msgs.length) return msgs.join(' · ');
      }
    }

    // Si no hay detail pero hay status code, indicamos qué pasó.
    if (e?.status) {
      const statusMsg = e?.error?.message || e?.statusText || '';
      return `Error del servidor (HTTP ${e.status})${statusMsg ? ': ' + statusMsg : ''}`;
    }

    return 'No se pudo guardar — revisa la consola del navegador (F12) para más detalles.';
  }

  async saveTiers() {
    const id = this.raffle()?.id;
    if (!id) return;
    const error = this.validateTiersForm();
    if (error) {
      this.tiersError.set(error);
      return;
    }
    this.tiersError.set(null);
    this.savingTiers.set(true);

    const payload = {
      commission_tiers: this.tiersEdit.map((t) => ({
        from_count: Number(t.from_count),
        to_count: t.to_count == null ? null : Number(t.to_count),
        amount_per_ticket: Number(t.amount_per_ticket),
      })),
    };

    // Saltamos el HttpClient/interceptor de Angular y usamos fetch directo
    // para aislar dónde está el bug. Si fetch funciona, el problema está en
    // alguna abstracción de Angular. Si fetch también falla, vemos el error
    // de red real con logs detallados.
    const url = `${environment.apiUrl}/raffles/${id}`;
    const token = this.auth.accessToken;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    console.log('[saveTiers] PATCH', url, 'payload:', payload);

    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      });

      console.log('[saveTiers] response status:', response.status, response.statusText);

      const rawText = await response.text();
      console.log('[saveTiers] response body:', rawText);

      if (!response.ok) {
        let detail = rawText;
        try {
          const parsed = JSON.parse(rawText);
          detail = this.extractErrorMessage({ status: response.status, error: parsed });
        } catch { /* body wasn't JSON */ }
        this.tiersError.set(detail);
        this.toast.error('No se pudo guardar', detail);
        this.savingTiers.set(false);
        return;
      }

      const updated = JSON.parse(rawText);
      this.raffle.set(updated);
      this.savingTiers.set(false);
      this.tiersError.set(null);
      this.tiersModalOpen.set(false);
      this.toast.success('Tramos actualizados', 'Aplican a partir del próximo pago confirmado.');
    } catch (err: unknown) {
      // fetch failure: red caída, CORS bloqueado, DNS, timeout, etc.
      console.error('[saveTiers] fetch falló:', err);
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      const friendly = `No se pudo conectar al servidor. Detalle técnico: ${msg}`;
      this.tiersError.set(friendly);
      this.toast.error('No se pudo guardar', friendly);
      this.savingTiers.set(false);
    }
  }

  // ============ Gestión de premios ============

  private blankPrize() {
    const r = this.raffle();
    const used = new Set<number>((r?.prizes ?? []).map((p) => p.position));
    let pos = 1;
    while (used.has(pos)) pos++;
    const today = new Date();
    const inMonth = new Date(today.getFullYear(), today.getMonth() + Math.max(pos, 1), today.getDate());
    return {
      id: null as number | null,
      position: pos,
      name: '',
      draw_date: inMonth.toISOString().slice(0, 10),
      estimated_value: null as number | null,
      description: '',
    };
  }

  openPrizeModal(prize?: Prize) {
    if (prize) {
      this.prizeForm = {
        id: prize.id ?? null,
        position: prize.position,
        name: prize.name,
        draw_date: prize.draw_date,
        estimated_value: prize.estimated_value ?? null,
        description: prize.description ?? '',
      };
    } else {
      this.prizeForm = this.blankPrize();
    }
    this.prizeOpen.set(true);
  }

  closePrizeModal() {
    this.prizeOpen.set(false);
  }

  savePrize() {
    const r = this.raffle();
    if (!r) return;

    const { id, position, name, draw_date, estimated_value, description } = this.prizeForm;
    if (!name?.trim() || !draw_date || !position) {
      this.toast.error('Datos faltantes', 'Posición, nombre y fecha de sorteo son obligatorios.');
      return;
    }

    const payload = {
      position: Number(position),
      name: name.trim(),
      draw_date,
      estimated_value: estimated_value != null && estimated_value !== ('' as any)
        ? Number(estimated_value)
        : null,
      description: description?.trim() || null,
    };

    this.savingPrize.set(true);
    const obs$ = id
      ? this.raffleSvc.updatePrize(r.id, id, payload)
      : this.raffleSvc.addPrize(r.id, payload as any);

    obs$.subscribe({
      next: (saved) => {
        this.savingPrize.set(false);
        this.prizeOpen.set(false);
        const updated = { ...r };
        if (id) {
          updated.prizes = r.prizes.map((p) => (p.id === id ? { ...p, ...saved } : p));
        } else {
          updated.prizes = [...r.prizes, saved];
        }
        this.raffle.set(updated);
        this.toast.success(id ? 'Premio actualizado' : 'Premio creado', saved.name);
      },
      error: (e) => {
        this.savingPrize.set(false);
        this.toast.error('No se pudo guardar el premio', e?.error?.detail ?? 'Intenta de nuevo.');
      },
    });
  }

  deletePrize(prize: Prize) {
    const r = this.raffle();
    if (!r || !prize.id) return;
    this.confirmSvc.ask({
      title: `¿Eliminar premio #${prize.position}?`,
      message: `Se eliminará "${prize.name}" de esta rifa. Esta acción no se puede deshacer.`,
      tone: 'warning',
      icon: 'delete_outline',
      confirmLabel: 'Sí, eliminar',
      cancelLabel: 'Cancelar',
    }).subscribe((yes) => {
      if (!yes) return;
      this.raffleSvc.deletePrize(r.id, prize.id!).subscribe({
        next: () => {
          this.raffle.set({ ...r, prizes: r.prizes.filter((p) => p.id !== prize.id) });
          this.toast.success('Premio eliminado', prize.name);
        },
        error: (e) => {
          this.toast.error('No se pudo eliminar', e?.error?.detail ?? 'Intenta de nuevo.');
        },
      });
    });
  }

  // ============ Aplazar rifa ============

  openPostponeModal(r: Raffle) {
    // Sugerimos 1 mes después de la fecha actual
    const d = new Date(r.final_draw_date);
    d.setMonth(d.getMonth() + 1);
    this.postpone = {
      new_final_draw_date: d.toISOString().slice(0, 10),
      reason: '',
    };
    this.postponeOpen.set(true);
  }
  closePostponeModal() { this.postponeOpen.set(false); }

  doPostpone() {
    const r = this.raffle();
    if (!r) return;
    const p = this.postpone;
    if (!p.new_final_draw_date) {
      this.toast.error('Datos faltantes', 'Indica la nueva fecha del sorteo.');
      return;
    }
    if (p.new_final_draw_date <= r.final_draw_date) {
      this.toast.error('Fecha inválida', 'La nueva fecha debe ser posterior a la actual.');
      return;
    }

    this.confirmSvc.ask({
      title: `Aplazar "${r.name}" al ${p.new_final_draw_date}?`,
      message: 'Avisaremos por email a cada cliente con boleta pagada. Las boletas siguen activas.',
      tone: 'warning',
      icon: 'event_repeat',
      confirmLabel: 'Sí, aplazar',
      cancelLabel: 'Cancelar',
    }).subscribe((yes) => {
      if (!yes) return;
      this.postponing.set(true);
      this.raffleSvc.postpone(r.id, {
        new_final_draw_date: p.new_final_draw_date,
        reason: p.reason.trim() || undefined,
      }).subscribe({
        next: (updated) => {
          this.postponing.set(false);
          this.postponeOpen.set(false);
          this.raffle.set(updated);
          this.toast.success(
            'Rifa aplazada',
            `Nueva fecha: ${updated.final_draw_date}. Se notificó a los clientes pagados.`,
          );
        },
        error: (e) => {
          this.postponing.set(false);
          this.toast.error('No se pudo aplazar', e?.error?.detail ?? 'Intenta de nuevo.');
        },
      });
    });
  }

  // ============ Cancelar rifa ============

  openCancelModal(_r: Raffle) {
    this.cancelData = { reason: '', refund_contact: '', refund_message: '' };
    this.cancelOpen.set(true);
  }
  closeCancelModal() { this.cancelOpen.set(false); }

  doCancel() {
    const r = this.raffle();
    if (!r) return;
    const c = this.cancelData;
    if (!c.reason?.trim() || c.reason.trim().length < 3) {
      this.toast.error('Motivo obligatorio', 'Escribe el motivo de la cancelación (visible al cliente).');
      return;
    }

    this.confirmSvc.ask({
      title: `¿Cancelar "${r.name}" definitivamente?`,
      message: 'Esta acción es irreversible. Se enviará un email empático a cada cliente pagado con el proceso de reembolso.',
      tone: 'danger',
      icon: 'cancel',
      confirmLabel: 'Sí, cancelar rifa',
      cancelLabel: 'Volver',
    }).subscribe((yes) => {
      if (!yes) return;
      this.cancelling.set(true);
      this.raffleSvc.cancel(r.id, {
        reason: c.reason.trim(),
        refund_contact: c.refund_contact.trim() || undefined,
        refund_message: c.refund_message.trim() || undefined,
      }).subscribe({
        next: (updated) => {
          this.cancelling.set(false);
          this.cancelOpen.set(false);
          this.raffle.set(updated);
          this.toast.success('Rifa cancelada', 'Se notificó a los clientes pagados.');
        },
        error: (e) => {
          this.cancelling.set(false);
          this.toast.error('No se pudo cancelar', e?.error?.detail ?? 'Intenta de nuevo.');
        },
      });
    });
  }

  fmt(v: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);
  }

  /** Porcentaje con hasta 2 decimales. */
  pct(v: number | null | undefined): string {
    if (v == null) return '0';
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(v));
  }
}
