import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';

import { Prize, Ticket } from '@core/models/raffle.model';

interface PositionedNumber {
  number: string;
  x: number; // 0..100 (%)
  y: number; // 0..100 (%)
}

/**
 * Boleta vertical con diseño de cancha de fútbol.
 *
 * - 20 números por boleta, en formación 3-4-3 por mitad.
 * - Mitad superior: 10 números (delanteros 3, medios 4, defensas 3 — desde la línea media hacia el borde superior).
 * - Mitad inferior: 10 números (delanteros 3, medios 4, defensas 3 — desde la línea media hacia el borde inferior).
 * - No hay porteros ni árbitros — sólo los 20 jugadores.
 */
export type TicketTheme = 'soccer' | 'romantic';

@Component({
  selector: 'app-ticket-design',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ticket-design.component.html',
  styleUrl: './ticket-design.component.scss',
})
export class TicketDesignComponent {
  readonly ticket = input.required<Ticket>();
  readonly raffleName = input<string>('Gran Rifa');
  readonly prizes = input<Prize[]>([]);
  readonly primaryColor = input<string>('#1b8b3b');
  readonly qrImageUrl = input<string | null>(null);
  readonly verifyUrl = input<string | null>(null);
  /** Nombre del responsable de la rifa (aparece en banda inferior del ticket). */
  readonly responsibleName = input<string | null>(null);
  /** Teléfono del responsable de la rifa. */
  readonly responsiblePhone = input<string | null>(null);
  /** Precio de la boleta en COP. Si se pasa, se muestra como chip dorado
   *  prominente en el header del ticket. */
  readonly ticketPrice = input<number | null>(null);
  /** Diseño visual: 'soccer' (cancha + chips ovalados) o 'romantic'
   *  (fondo rosa + corazones + silueta de pareja). Default soccer. */
  readonly theme = input<TicketTheme>('soccer');

  /** "$20.000" formateado, o null si no hay precio. */
  readonly formattedPrice = computed<string | null>(() => {
    const p = this.ticketPrice();
    if (p == null || p <= 0) return null;
    return '$' + new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(p);
  });

  /** "2026-09-17" → "17 SEP". Para fechas en cards de premios — más
   *  legible y compacto que el ISO crudo. Si la fecha está vacía o mal,
   *  devuelve el string original. */
  formatPrizeDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
    if (isNaN(d.getTime())) return iso;
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
    return `${day} ${months[d.getMonth()]}`;
  }

  /** N° de sorteos × N° de números por boleta. */
  readonly totalOpportunities = computed(() => {
    const numbers = this.ticket().numbers?.length ?? 0;
    const prizesCount = this.prizes().length || 1;
    return numbers * prizesCount;
  });

  /** Devuelve los números ordenados por position. */
  readonly orderedNumbers = computed(() =>
    [...this.ticket().numbers].sort((a, b) => a.position - b.position).map((n) => n.number),
  );

  /** Coordenadas (en %) para cada número.
   *
   *  - tema 'romantic' + 10 números → los 10 corazones forman un CORAZÓN
   *    (posiciones sobre la curva paramétrica del corazón)
   *  - 20 números → formación 3-4-3 / 3-4-3 (clásico cancha de fútbol)
   *  - 10 números (otros temas) → 2 filas de 5 (compacto)
   *  - cualquier otra cantidad → distribución uniforme automática
   */
  readonly positioned = computed<PositionedNumber[]>(() => {
    const nums = this.orderedNumbers();
    if (!nums.length) return [];

    // Tema romántico + 10 números: forman un corazón visualmente
    if (this.theme() === 'romantic' && nums.length === 10) {
      return this.heartLayout(nums);
    }

    // Formación clásica 3-4-3 / 3-4-3 para 20 números
    if (nums.length === 20) {
      return this.layoutByRows(nums, [3, 4, 3], [38, 25, 12], [3, 4, 3], [62, 75, 88]);
    }

    // 10 números (no romantic) → 2 filas de 5
    if (nums.length === 10) {
      return this.layoutByRows(nums, [5], [30], [5], [70]);
    }

    // Fallback uniforme: filas de ~5 cols repartidas en altura disponible.
    const cols = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(nums.length))));
    const rows = Math.ceil(nums.length / cols);
    const result: PositionedNumber[] = [];
    const yStart = 15;
    const yEnd = 85;
    const yStep = rows > 1 ? (yEnd - yStart) / (rows - 1) : 0;
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      const remaining = nums.length - idx;
      const colsThisRow = Math.min(cols, remaining);
      const y = rows === 1 ? 50 : yStart + r * yStep;
      for (let c = 0; c < colsThisRow; c++) {
        const x = ((c + 1) * 100) / (colsThisRow + 1);
        result.push({ number: nums[idx++], x, y });
      }
    }
    return result;
  });

  /** Posiciones HAND-TUNED para que los 10 corazones formen claramente
   *  un corazón visualmente. La curva paramétrica matemática quedaba
   *  débil con solo 10 puntos (los lóbulos exteriores se veían como
   *  "orejas" puntiagudas). Estas posiciones están tuneadas para
   *  que el ojo las lea como un corazón sin esfuerzo, en combinación
   *  con el outline-guía SVG que va detrás.
   *
   *  Orden: empieza arriba-centro (la "V"), va en sentido horario por
   *  el lóbulo derecho → punta inferior → lóbulo izquierdo.
   */
  private heartLayout(nums: string[]): PositionedNumber[] {
    const positions: Array<[number, number]> = [
      [50, 26], // 0 — top center dip (la "V")
      [68, 18], // 1 — top of right lobe peak
      [82, 32], // 2 — outer right lobe (NO tan alto, queda redondo)
      [78, 51], // 3 — right side mid
      [63, 70], // 4 — lower-right curve
      [50, 86], // 5 — bottom point
      [37, 70], // 6 — lower-left curve
      [22, 51], // 7 — left side mid
      [18, 32], // 8 — outer left lobe (mirror del 2)
      [32, 18], // 9 — top of left lobe peak
    ];
    return positions.slice(0, nums.length).map(([x, y], i) => ({
      number: nums[i], x, y,
    }));
  }

  /** Helper: arma las posiciones para una lista de "filas" arriba + abajo. */
  private layoutByRows(
    nums: string[],
    topRows: readonly number[], topYs: readonly number[],
    bottomRows: readonly number[], bottomYs: readonly number[],
  ): PositionedNumber[] {
    const result: PositionedNumber[] = [];
    let i = 0;
    for (let r = 0; r < topRows.length; r++) {
      const count = topRows[r];
      const y = topYs[r];
      for (let k = 0; k < count; k++) {
        const x = ((k + 1) * 100) / (count + 1);
        result.push({ number: nums[i++], x, y });
      }
    }
    for (let r = 0; r < bottomRows.length; r++) {
      const count = bottomRows[r];
      const y = bottomYs[r];
      for (let k = 0; k < count; k++) {
        const x = ((k + 1) * 100) / (count + 1);
        result.push({ number: nums[i++], x, y });
      }
    }
    return result;
  }
}
