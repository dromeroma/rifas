import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AdminService } from '@core/services/admin.service';
import { ToastService } from '@core/services/toast.service';

import {
  PrintData,
  TicketPrintSheetComponent,
} from './ticket-print-sheet.component';

/**
 * Página fullscreen (sin shell) que carga la data y renderiza la hoja de
 * impresión. Tiene una toolbar pegada arriba que se oculta en `@media print`
 * para que la impresión salga limpia.
 *
 * Ruta: `/admin/print/:raffleId/:sellerId`
 */
@Component({
  selector: 'app-ticket-print-page',
  standalone: true,
  imports: [CommonModule, TicketPrintSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="layout">
      <header class="toolbar no-print">
        <div class="left">
          <button class="back" (click)="goBack()" aria-label="Volver">
            <span class="material-icons">arrow_back</span>
            Volver
          </button>
          @if (data()) {
            <div class="meta">
              <strong>{{ data()!.raffle_name }}</strong>
              <span class="dim">·</span>
              <span>{{ data()!.seller_name }}</span>
              <span class="dim">·</span>
              <span>{{ data()!.tickets.length }} boleta(s)</span>
            </div>
          }
        </div>
        <div class="right">
          <button class="btn ghost" (click)="goBack()">Cancelar</button>
          <button
            class="btn primary"
            [disabled]="!data() || marking()"
            (click)="printAndMark()"
          >
            <span class="material-icons">print</span>
            {{ marking() ? 'Procesando...' : 'Imprimir y marcar' }}
          </button>
        </div>
      </header>

      @if (loading()) {
        <div class="state">
          <div class="spinner"></div>
          <p>Cargando boletas...</p>
        </div>
      } @else if (error()) {
        <div class="state error">
          <span class="material-icons">error_outline</span>
          <p>{{ error() }}</p>
          <button class="btn ghost" (click)="goBack()">Volver</button>
        </div>
      } @else if (data()) {
        @if (data()!.tickets.length === 0) {
          <div class="state">
            <span class="material-icons">inventory_2</span>
            <p>Este vendedor no tiene boletas asignadas en esta rifa.</p>
            <button class="btn ghost" (click)="goBack()">Volver</button>
          </div>
        } @else {
          <app-ticket-print-sheet [data]="data()!" />
        }
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      min-height: 100vh;
      background: #e5e7eb;
    }
    .layout {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 20px;
      background: #0a0e0c;
      color: #fff;
      box-shadow: 0 2px 12px rgba(0,0,0,0.18);
      gap: 16px;
      flex-wrap: wrap;
    }
    .left, .right { display: flex; align-items: center; gap: 12px; }
    .back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.18);
      color: #fff;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .back:hover { background: rgba(255,255,255,0.08); }
    .back .material-icons { font-size: 18px; }

    .meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: rgba(255,255,255,0.86);
    }
    .meta strong { color: #fff; }
    .dim { color: rgba(255,255,255,0.4); }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background 0.15s, transform 0.1s;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn.ghost {
      background: transparent;
      border-color: rgba(255,255,255,0.18);
      color: #fff;
    }
    .btn.ghost:hover:not(:disabled) { background: rgba(255,255,255,0.08); }
    .btn.primary {
      background: #1ec77b;
      color: #0a0e0c;
    }
    .btn.primary:hover:not(:disabled) { background: #18b06e; }
    .btn .material-icons { font-size: 18px; }

    .state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      padding: 60px 20px;
      color: #4b5563;
      text-align: center;
    }
    .state .material-icons { font-size: 48px; color: #9ca3af; }
    .state p { margin: 0; font-size: 15px; }
    .state.error .material-icons { color: #ef4444; }
    .state.error p { color: #b91c1c; }

    .spinner {
      width: 44px; height: 44px;
      border: 3px solid rgba(0,0,0,0.08);
      border-top-color: #1ec77b;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media print {
      .no-print { display: none !important; }
      :host { background: #fff; }
      .layout { min-height: auto; }
      .state { display: none !important; }
    }
  `],
})
export class TicketPrintPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly marking = signal(false);
  readonly error = signal<string | null>(null);
  readonly data = signal<PrintData | null>(null);

  private raffleId = 0;
  private sellerId = 0;

  ngOnInit(): void {
    const raffleIdRaw = this.route.snapshot.paramMap.get('raffleId');
    const sellerIdRaw = this.route.snapshot.paramMap.get('sellerId');
    this.raffleId = Number(raffleIdRaw);
    this.sellerId = Number(sellerIdRaw);

    if (!this.raffleId || !this.sellerId) {
      this.error.set('URL inválida');
      this.loading.set(false);
      return;
    }

    this.admin.printData(this.raffleId, this.sellerId).subscribe({
      next: (resp) => {
        this.data.set(resp as PrintData);
        this.loading.set(false);
        // Le da un breve respiro al DOM para que los QRs se rendericen antes
        // de que el usuario dispare imprimir.
      },
      error: (e) => {
        const detail = e?.error?.detail ?? 'No se pudieron cargar las boletas';
        this.error.set(typeof detail === 'string' ? detail : 'Error cargando boletas');
        this.loading.set(false);
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/admin/assignments']);
  }

  /** Marca como impresas en backend, abre el diálogo de impresión del browser. */
  printAndMark(): void {
    const d = this.data();
    if (!d || !d.tickets.length) return;

    this.marking.set(true);
    const ticketIds = d.tickets.map((t) => t.ticket_id);

    this.admin.markPrinted(this.raffleId, ticketIds).subscribe({
      next: () => {
        this.marking.set(false);
        this.toast.success('Marcadas como impresas', `${ticketIds.length} boleta(s) registradas.`);
        setTimeout(() => window.print(), 100);
      },
      error: () => {
        this.marking.set(false);
        // Imprimir aunque falle el marcado — no bloquea la salida física.
        this.toast.error('No se pudieron marcar', 'Se imprime de todas formas.');
        setTimeout(() => window.print(), 100);
      },
    });
  }
}
