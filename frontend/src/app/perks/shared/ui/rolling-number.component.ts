/**
 * RollingNumberComponent — número que se anima al cambiar.
 *
 * Uso:
 *   <perks-rolling-number [value]="42"></perks-rolling-number>
 *
 * Suave: interpolación exponencial en ~450 ms con
 * requestAnimationFrame. Respeta prefers-reduced-motion.
 */
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  signal,
} from '@angular/core';

@Component({
  selector: 'perks-rolling-number',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ display() }}`,
  styles: [`
    :host {
      display: inline-block;
      font-variant-numeric: tabular-nums;
    }
  `],
})
export class RollingNumberComponent implements OnChanges, OnDestroy {
  @Input() value = 0;
  @Input() duration = 450;
  @Input() format: 'integer' | 'decimal' = 'integer';

  readonly display = signal('0');

  private rafId: number | null = null;

  ngOnChanges(): void {
    if (this.prefersReducedMotion()) {
      this.display.set(this.formatValue(this.value));
      return;
    }
    this.animateTo(this.value);
  }

  ngOnDestroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  private animateTo(target: number): void {
    const currentText = this.display();
    const start = parseFloat(currentText.replace(/[^0-9.-]/g, '')) || 0;
    const startTime = performance.now();
    const duration = this.duration;

    const tick = (now: number): void => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // easeOutExpo — arranca rápido, aterriza suave
      const eased =
        progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const value = start + (target - start) * eased;
      this.display.set(this.formatValue(value));
      if (progress < 1) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        this.rafId = null;
      }
    };
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(tick);
  }

  private formatValue(v: number): string {
    if (this.format === 'integer') {
      return new Intl.NumberFormat('es-CO', {
        maximumFractionDigits: 0,
      }).format(Math.round(v));
    }
    return new Intl.NumberFormat('es-CO', {
      maximumFractionDigits: 2,
    }).format(v);
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}
