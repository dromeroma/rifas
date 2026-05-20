import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';

import { ConfirmService } from '@core/services/confirm.service';
import { ButtonComponent } from './button.component';
import { ModalComponent } from './modal.component';

@Component({
  selector: 'app-confirm-host',
  standalone: true,
  imports: [CommonModule, ModalComponent, ButtonComponent],
  template: `
    <app-modal
      [open]="isOpen()"
      [title]="state()?.title ?? ''"
      size="sm"
      [closeOnBackdrop]="true"
      (close)="confirmSvc.cancel()"
    >
      <div class="content">
        <div class="icon icon--{{ state()?.tone }}">
          <span class="material-icons">{{ state()?.icon ?? defaultIcon() }}</span>
        </div>
        @if (state()?.message) {
          <p class="message">{{ state()!.message }}</p>
        }
      </div>

      <ng-container slot="footer">
        <app-button variant="secondary" (click)="confirmSvc.cancel()">
          {{ state()?.cancelLabel ?? 'Cancelar' }}
        </app-button>
        <app-button
          [variant]="state()?.tone === 'danger' ? 'danger' : 'primary'"
          (click)="confirmSvc.confirm()"
        >
          {{ state()?.confirmLabel ?? 'Aceptar' }}
        </app-button>
      </ng-container>
    </app-modal>
  `,
  styles: [`
    :host { display: contents; }

    .content {
      display: grid; gap: var(--s-3);
      justify-items: center;
      text-align: center;
      padding: var(--s-3) 0;
    }
    .icon {
      width: 56px; height: 56px;
      border-radius: 50%;
      display: grid; place-items: center;
      background: var(--bg-hover);
      color: var(--text-muted);
    }
    .icon .material-icons { font-size: 28px; }
    .icon--default { background: var(--accent-soft); color: var(--accent); }
    .icon--danger  { background: var(--danger-soft); color: var(--danger); }
    .icon--warning { background: var(--warning-soft); color: var(--warning); }

    .message {
      color: var(--text-muted);
      font-size: 14px;
      line-height: 1.5;
      max-width: 360px;
    }
  `],
})
export class ConfirmHostComponent {
  readonly confirmSvc = inject(ConfirmService);
  readonly state = this.confirmSvc.state;
  readonly isOpen = computed(() => this.state()?.open ?? false);

  defaultIcon(): string {
    const tone = this.state()?.tone;
    if (tone === 'danger') return 'warning_amber';
    if (tone === 'warning') return 'help_outline';
    return 'check_circle';
  }
}
