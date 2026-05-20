import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-avatar',
  standalone: true,
  imports: [CommonModule],
  template: `<span class="avatar" [style.--size.px]="size()">{{ initials() }}</span>`,
  styles: [`
    :host { display: inline-block; }
    .avatar {
      --size: 36px;
      width: var(--size);
      height: var(--size);
      border-radius: 50%;
      background: var(--accent);
      color: var(--accent-fg);
      display: grid;
      place-items: center;
      font-weight: 700;
      font-size: calc(var(--size) * 0.36);
      letter-spacing: 0.02em;
      flex-shrink: 0;
    }
  `],
})
export class AvatarComponent {
  readonly name = input<string>('?');
  readonly size = input<number>(36);

  readonly initials = computed(() => {
    const parts = (this.name() || '?').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return parts.slice(0, 2).map(p => p[0].toUpperCase()).join('');
  });
}
