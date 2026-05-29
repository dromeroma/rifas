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
                  <!-- TALÓN VENDEDOR -->
                  <div class="talon">
                    <div class="talon-head">
                      <div>
                        <div class="talon-eyebrow">Talón vendedor</div>
                        <div class="big-label">{{ formatLabel(t.number_label) }}</div>
                        <div class="short-code">Cód: <strong>{{ t.short_code }}</strong></div>
                      </div>
                      <img class="qr" [src]="t.qrAdmin" alt="Escanea para verificar la boleta" />
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
                      <img class="qr small" [src]="t.qrPromo" alt="Escanea para verificar tu boleta en línea" />
                    </header>

                    <div class="raffle-name">{{ data().raffle_name }}</div>

                    <!-- Cancha de fútbol vertical, mismo diseño que la app -->
                    <div class="field" aria-label="Cancha con los 20 números">
                      <svg class="field__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                        <!-- borde exterior -->
                        <rect x="2" y="2" width="96" height="96" fill="none"
                              stroke="rgba(50,70,55,0.65)" stroke-width="0.6" />
                        <!-- línea media -->
                        <line x1="2" y1="50" x2="98" y2="50"
                              stroke="rgba(50,70,55,0.65)" stroke-width="0.5" />
                        <!-- círculo central -->
                        <circle cx="50" cy="50" r="8" fill="none"
                                stroke="rgba(50,70,55,0.65)" stroke-width="0.5" />
                        <circle cx="50" cy="50" r="0.9" fill="rgba(50,70,55,0.85)" />
                        <!-- área grande arriba -->
                        <rect x="25" y="2" width="50" height="10" fill="none"
                              stroke="rgba(50,70,55,0.65)" stroke-width="0.5" />
                        <!-- área grande abajo -->
                        <rect x="25" y="88" width="50" height="10" fill="none"
                              stroke="rgba(50,70,55,0.65)" stroke-width="0.5" />
                        <!-- área pequeña arriba -->
                        <rect x="38" y="2" width="24" height="4" fill="none"
                              stroke="rgba(50,70,55,0.65)" stroke-width="0.4" />
                        <!-- área pequeña abajo -->
                        <rect x="38" y="94" width="24" height="4" fill="none"
                              stroke="rgba(50,70,55,0.65)" stroke-width="0.4" />
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
    .page--six .player__chip {
      min-width: 0.24in;
      height: 0.2in;
      padding: 0 3px;
      font-size: 7pt;
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
    /* Colores suavizados para que en impresión B&W salga como un gris muy
       claro (casi blanco) y los chips se vean nítidos. En color sigue
       leyéndose como una cancha de fútbol con stripes. */
    .field {
      position: relative;
      flex: 1;
      aspect-ratio: 2 / 3;
      min-height: 1.4in;
      max-height: 2.1in;
      background:
        repeating-linear-gradient(
          to bottom,
          #c6e9d0 0,
          #c6e9d0 5%,
          #b3dfbf 5%,
          #b3dfbf 10%
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
      min-width: 0.32in;
      height: 0.22in;
      padding: 0 5px;
      background: #ffffff;
      color: #0b3d91;
      border: 1.4px solid #0b3d91;
      border-radius: 999px;
      font-family: 'Inter', system-ui, sans-serif;
      font-weight: 700;
      font-size: 8.5pt;
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

  formatDate(iso: string): string {
    const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
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
