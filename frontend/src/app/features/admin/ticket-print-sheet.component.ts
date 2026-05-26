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
          <section class="page">
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
                  <!-- TALÓN VENDEDOR -->
                  <div class="talon">
                    <div class="talon-head">
                      <div>
                        <div class="talon-eyebrow">Talón vendedor</div>
                        <div class="big-label">{{ formatLabel(t.number_label) }}</div>
                        <div class="short-code">Cód: <strong>{{ t.short_code }}</strong></div>
                      </div>
                      <img class="qr" [src]="t.qrAdmin" alt="QR admin" />
                    </div>
                    <div class="lines">
                      <div class="line"><span>Cliente:</span></div>
                      <div class="line"><span>Cédula:</span></div>
                      <div class="line"><span>Celular:</span></div>
                      <div class="line"><span>Firma:</span></div>
                    </div>
                  </div>

                  <!-- LÍNEA DE CORTE -->
                  <div class="cut">
                    <span class="scissor" aria-hidden="true">✂</span>
                  </div>

                  <!-- BOLETA CLIENTE -->
                  <div class="ticket">
                    <header class="ticket-head">
                      <div>
                        <div class="ticket-eyebrow">Boleta</div>
                        <div class="ticket-label">{{ formatLabel(t.number_label) }}</div>
                      </div>
                      <img class="qr small" [src]="t.qrPromo" alt="QR promo" />
                    </header>

                    <div class="raffle-name">{{ data().raffle_name }}</div>

                    <!-- Cancha 3-4-3 / 3-4-3 con números -->
                    <div class="field">
                      <div class="field-half top">
                        @for (row of topRows; track $index) {
                          <div class="row" [class.r3]="row === 3" [class.r4]="row === 4">
                            @for (n of numbersForRow(t.numbers, $index, 'top'); track $index) {
                              <span class="num">{{ n }}</span>
                            }
                          </div>
                        }
                      </div>
                      <div class="center-line"></div>
                      <div class="field-half bottom">
                        @for (row of bottomRows; track $index) {
                          <div class="row" [class.r3]="row === 3" [class.r4]="row === 4">
                            @for (n of numbersForRow(t.numbers, $index, 'bottom'); track $index) {
                              <span class="num">{{ n }}</span>
                            }
                          </div>
                        }
                      </div>
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

                    <!-- Watermark sutil -->
                    <div class="watermark" aria-hidden="true">{{ data().raffle_name }}</div>
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

    /* === Grilla 2x2 === */
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 0.18in;
      flex: 1;
    }

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
      font-size: 10pt;
      font-weight: 700;
      color: #0a0e0c;
      text-align: center;
      padding: 0.04in 0;
      border-top: 1px solid #e5e7eb;
      border-bottom: 1px solid #e5e7eb;
    }

    /* === Cancha (campo de fútbol) === */
    .field {
      position: relative;
      flex: 1;
      min-height: 1.3in;
      max-height: 1.6in;
      background:
        repeating-linear-gradient(
          0deg,
          rgba(30, 199, 123, 0.05) 0,
          rgba(30, 199, 123, 0.05) 6px,
          rgba(30, 199, 123, 0.08) 6px,
          rgba(30, 199, 123, 0.08) 12px
        );
      border: 1px solid #1f2937;
      border-radius: 3px;
      display: flex;
      flex-direction: column;
      padding: 0.04in 0.06in;
      overflow: hidden;
    }
    .field-half {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-around;
    }
    .field-half.top { padding-top: 0.02in; }
    .field-half.bottom { padding-bottom: 0.02in; }
    .center-line {
      height: 0;
      border-top: 1px solid #1f2937;
      position: relative;
      margin: 0;
    }
    .center-line::after {
      content: '';
      position: absolute;
      left: 50%;
      top: 50%;
      width: 0.32in;
      height: 0.32in;
      border: 1px solid #1f2937;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255,255,255,0.5);
    }
    .row {
      display: flex;
      justify-content: space-around;
      align-items: center;
    }
    .num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 0.34in;
      height: 0.24in;
      padding: 0 4px;
      background: #fff;
      border: 1.2px solid #0a0e0c;
      border-radius: 999px;
      font-family: 'Inter', system-ui, sans-serif;
      font-weight: 800;
      font-size: 9pt;
      color: #0a0e0c;
      box-shadow: 0 1px 0 rgba(0,0,0,0.1);
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

  readonly loading = signal(true);
  private readonly rendered = signal<RenderedTicket[]>([]);

  readonly topRows = [3, 4, 3] as const;
  readonly bottomRows = [3, 4, 3] as const;

  readonly pages = computed<RenderedTicket[][]>(() => {
    const all = this.rendered();
    const out: RenderedTicket[][] = [];
    for (let i = 0; i < all.length; i += 4) {
      out.push(all.slice(i, i + 4));
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

    const rendered: RenderedTicket[] = [];
    for (const t of tickets) {
      const adminUrl = `${origin}/admin/registrar-venta?code=${encodeURIComponent(t.code)}`;
      const promoUrl = `${origin}/r/${raffleId}?b=${encodeURIComponent(t.code)}`;
      const [qrAdmin, qrPromo] = await Promise.all([
        QR.toDataURL(adminUrl, opts('#1f2937')),
        QR.toDataURL(promoUrl, opts('#0a0e0c')),
      ]);
      rendered.push({ ...t, qrAdmin, qrPromo });
    }
    this.rendered.set(rendered);
  }

  /** "001" → "BOL 001". Mantiene formato consistente con la app. */
  formatLabel(label: string): string {
    return `BOL ${label}`;
  }

  formatDate(iso: string): string {
    const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /**
   * Devuelve los números que deben ir en una fila específica de una mitad
   * de la cancha. Formación 3-4-3 / 3-4-3, total 20 números.
   * top:    fila0=0..2,   fila1=3..6,   fila2=7..9
   * bottom: fila0=10..12, fila1=13..16, fila2=17..19
   */
  numbersForRow(numbers: string[], rowIndex: number, half: 'top' | 'bottom'): string[] {
    if (!numbers || numbers.length !== 20) {
      // Si no hay 20 números, distribuye lo que haya en orden (defensivo).
      const chunk = 3;
      return numbers.slice(rowIndex * chunk, rowIndex * chunk + chunk);
    }
    const starts = half === 'top'
      ? [0, 3, 7]      // 3 + 4 + 3 = 10
      : [10, 13, 17];
    const lens = [3, 4, 3];
    return numbers.slice(starts[rowIndex], starts[rowIndex] + lens[rowIndex]);
  }
}
