import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AdminService } from '@core/services/admin.service';
import { ToastService } from '@core/services/toast.service';

import {
  PrintData,
  PrintDesign,
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
          <div class="seg" role="group" aria-label="Diseño de la boleta">
            <span class="seg__label">Diseño:</span>
            <button
              type="button"
              class="seg__opt"
              [class.seg__opt--on]="design() === 'soccer'"
              (click)="design.set('soccer')"
              title="Cancha de fútbol con números en formación">
              Cancha
            </button>
            <button
              type="button"
              class="seg__opt"
              [class.seg__opt--on]="design() === 'professional'"
              (click)="design.set('professional')"
              title="Boleta tradicional elegante: TV + grilla de números">
              Profesional
            </button>
          </div>
          <div class="seg" role="group" aria-label="Boletas por hoja">
            <span class="seg__label">Por hoja:</span>
            <button
              type="button"
              class="seg__opt"
              [class.seg__opt--on]="perPage() === 4"
              (click)="perPage.set(4)"
              title="2 columnas x 2 filas — tamaño cómodo">
              4
            </button>
            <button
              type="button"
              class="seg__opt"
              [class.seg__opt--on]="perPage() === 6"
              (click)="perPage.set(6)"
              title="3 columnas x 2 filas — ahorra papel">
              6
            </button>
          </div>
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
          <app-ticket-print-sheet
            [data]="data()!"
            [boletasPerPage]="perPage()"
            [printDesign]="design()"
          />
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

    /* Selector 4 / 6 boletas por hoja */
    .seg {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 6px 4px 10px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
    }
    .seg__label {
      font-size: 11px;
      color: rgba(255,255,255,0.6);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 600;
    }
    .seg__opt {
      min-width: 30px;
      padding: 6px 10px;
      background: transparent;
      border: 0;
      color: rgba(255,255,255,0.65);
      font-weight: 700;
      font-size: 13px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    }
    .seg__opt:hover { background: rgba(255,255,255,0.06); color: #fff; }
    .seg__opt--on { background: #1ec77b; color: #0a0e0c; }
    .seg__opt--on:hover { background: #18b06e; color: #0a0e0c; }

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
  /** 4 (default, 2x2) o 6 (2x3) boletas por hoja carta. Lo controla el
   *  toggle de la toolbar; el sheet re-renderiza en vivo al cambiarlo. */
  readonly perPage = signal<4 | 6>(4);
  /** Diseño del cuerpo: 'soccer' (cancha de fútbol, default) o
   *  'professional' (boleta clásica elegante con TV ilustrado + grilla
   *  de 20 números). Toggle en la toolbar. */
  readonly design = signal<PrintDesign>('soccer');

  private raffleId = 0;
  private sellerId = 0;

  ngOnInit(): void {
    const raffleIdRaw = this.route.snapshot.paramMap.get('raffleId');
    const sellerIdRaw = this.route.snapshot.paramMap.get('sellerId');
    this.raffleId = Number(raffleIdRaw);

    if (!this.raffleId) {
      this.error.set('URL inválida');
      this.loading.set(false);
      return;
    }

    // Detecta modo:
    //   /admin/print/:raffleId/range?from=001&to=050 → modo rango
    //   /admin/print/:raffleId/:sellerId           → modo vendedor
    const isRangeMode = sellerIdRaw === 'range';
    const fromLabel = this.route.snapshot.queryParamMap.get('from');
    const toLabel = this.route.snapshot.queryParamMap.get('to');

    if (isRangeMode) {
      if (!fromLabel || !toLabel) {
        this.error.set('Faltan los parámetros from y to en el rango.');
        this.loading.set(false);
        return;
      }
      this.sellerId = 0;
      this.admin.printDataRange(this.raffleId, fromLabel, toLabel).subscribe({
        next: (resp) => { this.data.set(resp as PrintData); this.loading.set(false); },
        error: (e) => {
          const detail = e?.error?.detail ?? 'No se pudieron cargar las boletas';
          this.error.set(typeof detail === 'string' ? detail : 'Error cargando boletas');
          this.loading.set(false);
        },
      });
      return;
    }

    this.sellerId = Number(sellerIdRaw);
    if (!this.sellerId) {
      this.error.set('URL inválida');
      this.loading.set(false);
      return;
    }

    // Filtro opcional ?ids=1,2,3 para imprimir solo una selección.
    const idsParam = this.route.snapshot.queryParamMap.get('ids');
    const filterIds = idsParam
      ? new Set(idsParam.split(',').map((s) => Number(s)).filter((n) => !isNaN(n)))
      : null;

    this.admin.printData(this.raffleId, this.sellerId).subscribe({
      next: (resp) => {
        let data = resp as PrintData;
        if (filterIds && filterIds.size > 0) {
          data = {
            ...data,
            tickets: data.tickets.filter((t) => filterIds.has(t.ticket_id)),
          };
        }
        this.data.set(data);
        this.loading.set(false);
      },
      error: (e) => {
        const detail = e?.error?.detail ?? 'No se pudieron cargar las boletas';
        this.error.set(typeof detail === 'string' ? detail : 'Error cargando boletas');
        this.loading.set(false);
      },
    });
  }

  goBack(): void {
    // En modo rango (sellerId=0) regresa al detalle de la rifa; en modo
    // vendedor regresa al listado de asignaciones que es donde nació el flujo.
    if (this.sellerId === 0 && this.raffleId) {
      this.router.navigate(['/admin/raffles', this.raffleId]);
    } else {
      this.router.navigate(['/admin/assignments']);
    }
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
