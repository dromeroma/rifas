import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { ThemeService } from '@core/services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button class="tt" (click)="theme.toggle()" [attr.aria-label]="'Cambiar tema'" [title]="theme.isDark() ? 'Modo claro' : 'Modo oscuro'">
      <span class="material-icons">{{ theme.isDark() ? 'light_mode' : 'dark_mode' }}</span>
    </button>
  `,
  styles: [`
    .tt {
      width: 40px; height: 40px;
      display: grid; place-items: center;
      background: var(--bg-hover);
      color: var(--text-muted);
      border: 1px solid var(--border);
      border-radius: 50%;
      cursor: pointer;
      transition: background var(--t-fast), color var(--t-fast);
    }
    .tt:hover { background: var(--accent-soft); color: var(--accent); }
    .tt .material-icons { font-size: 18px; }
  `],
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
}
