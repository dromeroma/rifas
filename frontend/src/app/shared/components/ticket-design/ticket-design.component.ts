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

  /** "$20.000" formateado, o null si no hay precio. */
  readonly formattedPrice = computed<string | null>(() => {
    const p = this.ticketPrice();
    if (p == null || p <= 0) return null;
    return '$' + new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(p);
  });

  /** N° de sorteos × N° de números por boleta. */
  readonly totalOpportunities = computed(() => {
    const numbers = this.ticket().numbers?.length ?? 0;
    const prizesCount = this.prizes().length || 1;
    return numbers * prizesCount;
  });

  /** Devuelve los 20 números ordenados por position. */
  readonly orderedNumbers = computed(() =>
    [...this.ticket().numbers].sort((a, b) => a.position - b.position).map((n) => n.number),
  );

  /** Coordenadas (en porcentaje) para cada número siguiendo formación 3-4-3 por mitad. */
  readonly positioned = computed<PositionedNumber[]>(() => {
    const nums = this.orderedNumbers();
    if (nums.length !== 20) return [];

    const result: PositionedNumber[] = [];
    const rows = [3, 4, 3] as const; // delanteros, medios, defensas

    // Mitad SUPERIOR — desde el centro (y=50) hacia el borde superior (y=5)
    // 3 filas dentro de [50, 5]; usamos puntos en 38, 25, 12 aprox.
    const topYs = [38, 25, 12];
    // Mitad INFERIOR — desde el centro (y=50) hacia abajo (y=95)
    const bottomYs = [62, 75, 88];

    let i = 0;
    for (let r = 0; r < rows.length; r++) {
      const count = rows[r];
      const y = topYs[r];
      for (let k = 0; k < count; k++) {
        const x = ((k + 1) * 100) / (count + 1);
        result.push({ number: nums[i++], x, y });
      }
    }
    for (let r = 0; r < rows.length; r++) {
      const count = rows[r];
      const y = bottomYs[r];
      for (let k = 0; k < count; k++) {
        const x = ((k + 1) * 100) / (count + 1);
        result.push({ number: nums[i++], x, y });
      }
    }
    return result;
  });
}
