import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { Raffle } from '@core/models/raffle.model';
import { SellerAssignment, SellerUser } from '@core/models/stats.model';
import { AdminService } from '@core/services/admin.service';
import { RaffleService } from '@core/services/raffle.service';
import { ToastService } from '@core/services/toast.service';
import {
  ButtonComponent, CardComponent, ChipComponent, EmptyComponent,
} from '@shared/ui';

@Component({
  selector: 'app-assignments',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonComponent, CardComponent, ChipComponent, EmptyComponent,
  ],
  template: `
    <div class="page">
      <header class="page__head">
        <div>
          <h1>Asignaciones</h1>
          <p class="muted">Bloques de boletas asignadas a vendedores</p>
        </div>
      </header>

      <app-card title="Asignar bloque" subtitle="Se asignan boletas consecutivas desde donde quedó el último bloque.">
        <form class="form" (ngSubmit)="assign()">
          <label class="field">
            <span>Rifa</span>
            <select [(ngModel)]="form.raffle_id" name="raffle">
              @for (r of raffles(); track r.id) {
                <option [value]="r.id" [disabled]="!r.numbers_generated">
                  {{ r.name }} {{ r.numbers_generated ? '' : '(sin números)' }}
                </option>
              }
            </select>
          </label>

          <label class="field">
            <span>Vendedor</span>
            <select [(ngModel)]="form.seller_id" name="seller">
              @for (s of sellers(); track s.id) {
                <option [value]="s.id">{{ s.full_name }} — {{ s.email }}</option>
              }
            </select>
          </label>

          <label class="field">
            <span>Cantidad</span>
            <input type="number" min="1" [(ngModel)]="form.quantity" name="qty" inputmode="numeric" />
          </label>

          <div class="form__cta">
            <app-button type="submit" variant="primary" [loading]="saving()" [disabled]="!sellers().length" icon="add">
              {{ saving() ? 'Asignando...' : 'Asignar bloque' }}
            </app-button>
          </div>
        </form>

        @if (error()) {
          <div class="alert"><span class="material-icons">error_outline</span>{{ error() }}</div>
        }
        @if (!sellers().length) {
          <div class="hint">
            <span class="material-icons">info</span>
            No hay vendedores. Crea uno desde la sección Vendedores.
          </div>
        }
      </app-card>

      <app-card title="Asignaciones existentes" [subtitle]="list().length + ' total'">
        @if (!list().length) {
          <app-empty icon="assignment_ind" title="Sin asignaciones aún" description="Cuando asignes un bloque aparecerá aquí." />
        } @else {
          <div class="list">
            @for (a of list(); track a.id) {
              <article class="row">
                <div class="row__main">
                  <strong>{{ sellerName(a.seller_id) }}</strong>
                  <small class="muted">{{ raffleName(a.raffle_id) }}</small>
                </div>
                <div class="row__range">
                  <strong class="num">{{ pad(a.from_ticket) }} → {{ pad(a.to_ticket) }}</strong>
                  <small class="muted">{{ a.to_ticket - a.from_ticket + 1 }} boletas</small>
                </div>
                <app-chip [tone]="a.status === 'active' ? 'accent' : 'default'">{{ a.status }}</app-chip>
              </article>
            }
          </div>
        }
      </app-card>
    </div>
  `,
  styles: [`
    .page { display: grid; gap: var(--s-4); }
    .page__head h1 { font-size: 22px; }

    .form {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--s-3);
      align-items: end;
    }
    @media (min-width: 700px) {
      .form { grid-template-columns: 1.5fr 1.5fr 0.7fr auto; }
    }
    .field { display: grid; gap: 4px; font-size: 12px; color: var(--text-muted); }
    .field span { font-weight: 500; letter-spacing: 0.02em; }
    select, input {
      height: var(--h-input);
      background: var(--bg-input);
      border: 1px solid transparent;
      color: var(--text);
      padding: 0 var(--s-3);
      border-radius: var(--r-md);
      font-size: 14px;
    }
    select:focus, input:focus { outline: 0; border-color: var(--accent); }

    .form__cta { display: flex; justify-content: stretch; }
    @media (min-width: 700px) { .form__cta { justify-content: flex-end; } }

    .alert {
      display: flex; align-items: center; gap: 8px;
      padding: var(--s-3); background: var(--danger-soft); color: var(--danger);
      border-radius: var(--r-md); font-size: 13px; margin-top: var(--s-3);
    }
    .hint {
      display: flex; align-items: center; gap: 8px;
      padding: var(--s-3); background: var(--info-soft); color: var(--info);
      border-radius: var(--r-md); font-size: 13px; margin-top: var(--s-3);
    }

    .list { display: grid; gap: var(--s-2); }
    .row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: var(--s-3);
      align-items: center;
      padding: var(--s-3);
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
    }
    .row__main { display: grid; gap: 2px; }
    .row__main strong { font-size: 14px; }
    .row__main small { font-size: 12px; }
    .row__range { display: grid; gap: 2px; text-align: right; }
    .row__range strong { font-size: 14px; color: var(--accent); }
    .row__range small { font-size: 11px; }
  `],
})
export class AssignmentsComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly raffleSvc = inject(RaffleService);
  private readonly toast = inject(ToastService);

  raffles = signal<Raffle[]>([]);
  sellers = signal<SellerUser[]>([]);
  list = signal<SellerAssignment[]>([]);
  saving = signal(false);
  error = signal<string | null>(null);

  form = { raffle_id: 0, seller_id: 0, quantity: 20 };

  ngOnInit(): void {
    forkJoin({
      raffles: this.raffleSvc.list(),
      sellers: this.admin.listUsers('seller'),
      list: this.admin.listAssignments(),
    }).subscribe(({ raffles, sellers, list }) => {
      this.raffles.set(raffles);
      this.sellers.set(sellers);
      this.list.set(list);
      const firstReady = raffles.find((r) => r.numbers_generated);
      if (firstReady) this.form.raffle_id = firstReady.id;
      if (sellers.length) this.form.seller_id = sellers[0].id;
    });
  }

  assign() {
    this.error.set(null);
    if (!this.form.raffle_id || !this.form.seller_id || !this.form.quantity) {
      this.error.set('Completa todos los campos');
      return;
    }
    this.saving.set(true);
    this.admin.createAssignment(+this.form.raffle_id, +this.form.seller_id, +this.form.quantity).subscribe({
      next: (a) => {
        this.list.update((arr) => [a, ...arr]);
        this.saving.set(false);
        const seller = this.sellers().find(s => s.id === a.seller_id);
        this.toast.success(
          'Asignación creada',
          `Boletas ${this.pad(a.from_ticket)}–${this.pad(a.to_ticket)} asignadas a ${seller?.full_name ?? 'el vendedor'}.`,
        );
      },
      error: (e) => {
        const detail = e?.error?.detail ?? 'Error creando asignación';
        this.error.set(detail);
        this.saving.set(false);
        this.toast.error('No se pudo asignar', detail);
      },
    });
  }

  raffleName(id: number) { return this.raffles().find((r) => r.id === id)?.name ?? `#${id}`; }
  sellerName(id: number) { return this.sellers().find((s) => s.id === id)?.full_name ?? `#${id}`; }
  pad(n: number) { return String(n).padStart(3, '0'); }
}
