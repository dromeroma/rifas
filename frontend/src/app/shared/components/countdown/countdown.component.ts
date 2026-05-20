import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, input, signal } from '@angular/core';

@Component({
  selector: 'app-countdown',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="cd">
      @if (label()) { <small class="cd__label">{{ label() }}</small> }
      <div class="cd__grid">
        <div class="cd__cell"><strong>{{ parts().d }}</strong><span>días</span></div>
        <div class="cd__sep">:</div>
        <div class="cd__cell"><strong>{{ parts().h }}</strong><span>hrs</span></div>
        <div class="cd__sep">:</div>
        <div class="cd__cell"><strong>{{ parts().m }}</strong><span>min</span></div>
        <div class="cd__sep">:</div>
        <div class="cd__cell"><strong>{{ parts().s }}</strong><span>seg</span></div>
      </div>
    </div>
  `,
  styles: [`
    .cd { display: grid; gap: var(--s-2); }
    .cd__label {
      color: var(--text-muted);
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      font-weight: 600;
    }
    .cd__grid {
      display: inline-flex;
      align-items: flex-end;
      gap: 6px;
    }
    .cd__cell {
      display: grid;
      place-items: center;
      min-width: 56px;
      padding: 8px 10px;
      background: var(--accent);
      color: var(--accent-fg);
      border-radius: var(--r-md);
      box-shadow: var(--shadow-sm);
    }
    .cd__cell strong { font-size: 22px; font-variant-numeric: tabular-nums; line-height: 1; font-weight: 700; }
    .cd__cell span { font-size: 9px; opacity: 0.85; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 3px; }
    .cd__sep { color: var(--text-muted); font-weight: 700; padding-bottom: 14px; }

    @media (max-width: 480px) {
      .cd__cell { min-width: 48px; padding: 6px 8px; }
      .cd__cell strong { font-size: 18px; }
    }
  `],
})
export class CountdownComponent implements OnDestroy {
  readonly seconds = input<number>(0);
  readonly label = input<string>('');

  private timer = setInterval(() => this.tick.update((t) => t + 1), 1000);
  private tick = signal(0);

  readonly parts = computed(() => {
    this.tick();
    const remaining = Math.max(this.seconds() - this.tick(), 0);
    const d = Math.floor(remaining / 86400);
    const h = Math.floor((remaining % 86400) / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    return {
      d: String(d).padStart(2, '0'),
      h: String(h).padStart(2, '0'),
      m: String(m).padStart(2, '0'),
      s: String(s).padStart(2, '0'),
    };
  });

  ngOnDestroy(): void { clearInterval(this.timer); }
}
