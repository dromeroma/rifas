import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-progress-ring',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ring" [style.--size.px]="size()" [style.--pct]="clamped()" [style.--stroke]="color()">
      <div class="ring__inner">
        <strong class="tabular">{{ display() }}%</strong>
        @if (label()) { <small>{{ label() }}</small> }
      </div>
    </div>
  `,
  styles: [`
    :host { display: inline-block; }
    .ring {
      --size: 96px;
      --pct: 0;
      --stroke: var(--accent);
      width: var(--size);
      height: var(--size);
      border-radius: 50%;
      background: conic-gradient(var(--stroke) calc(var(--pct) * 1%), var(--bg-elevated) 0);
      display: grid;
      place-items: center;
      transition: background var(--t-base);
    }
    .ring__inner {
      width: calc(var(--size) - 16px);
      height: calc(var(--size) - 16px);
      background: var(--bg-surface);
      border-radius: 50%;
      display: grid;
      place-items: center;
      gap: 1px;
      text-align: center;
    }
    strong { font-size: 18px; color: var(--text); font-weight: 700; line-height: 1; }
    small { color: var(--text-muted); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
  `],
})
export class ProgressRingComponent {
  readonly value = input<number>(0); // 0..100
  readonly label = input<string>('');
  readonly size = input<number>(96);
  readonly color = input<string>('var(--accent)');

  readonly clamped = computed(() => Math.max(0, Math.min(100, this.value())));

  /** Texto del porcentaje: muestra hasta 2 decimales, sin ceros sobrantes
   *  (100 → "100", 22.34 → "22,34", 22.3 → "22,3"). */
  readonly display = computed(() => {
    const v = this.clamped();
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(v);
  });
}
