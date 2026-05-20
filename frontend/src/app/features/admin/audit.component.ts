import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AuditLog, AuditPage } from '@core/models/payment.model';
import { AuditService } from '@core/services/payment.service';
import {
  ButtonComponent, ChipComponent, EmptyComponent,
} from '@shared/ui';

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonComponent, ChipComponent, EmptyComponent,
  ],
  template: `
    <div class="page">
      <header class="page__head">
        <div>
          <h1>Auditoría</h1>
          <p class="muted">{{ data()?.total ?? 0 }} eventos registrados.</p>
        </div>
      </header>

      <!-- Filtros -->
      <div class="filters">
        <label class="filter">
          <span>Acción</span>
          <select [(ngModel)]="actionFilter" (change)="onFilter()">
            <option value="">Todas</option>
            <option value="auth.">auth.* (login, refresh)</option>
            <option value="raffle.">raffle.* (rifas)</option>
            <option value="ticket.">ticket.* (reservas, liberación, pagada)</option>
            <option value="payment.">payment.* (submit, confirm, reject)</option>
            <option value="customer.create">customer.create</option>
            <option value="user.create">user.create</option>
            <option value="assignment.create">assignment.create</option>
          </select>
        </label>
      </div>

      @if (loading()) {
        <p class="muted">Cargando...</p>
      } @else if (!data()?.items?.length) {
        <app-empty icon="history" title="Sin eventos" description="No hay registros que coincidan con los filtros." />
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th class="th-time">Fecha</th>
                <th>Actor</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th class="th-meta">Detalle</th>
                <th class="th-ip">IP</th>
              </tr>
            </thead>
            <tbody>
              @for (l of data()!.items; track l.id) {
                <tr>
                  <td class="td-time">
                    <strong>{{ l.created_at | date:'short' }}</strong>
                  </td>
                  <td>
                    @if (l.actor) {
                      <div class="actor">
                        <strong>{{ l.actor.full_name }}</strong>
                        <small class="muted">{{ l.actor.email }}</small>
                      </div>
                    } @else {
                      <small class="muted">—</small>
                    }
                  </td>
                  <td><app-chip [tone]="actionTone(l.action)">{{ l.action }}</app-chip></td>
                  <td>
                    @if (l.entity_type) {
                      <small class="entity">{{ l.entity_type }} #{{ l.entity_id ?? '?' }}</small>
                    }
                  </td>
                  <td class="td-meta">
                    @if (l.description) { <small>{{ l.description }}</small> }
                    @if (l.metadata_json) {
                      <details class="meta">
                        <summary>JSON</summary>
                        <pre>{{ formatMeta(l.metadata_json) }}</pre>
                      </details>
                    }
                  </td>
                  <td class="td-ip mono">{{ l.ip_address || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (totalPages() > 1) {
          <div class="pager">
            <app-button variant="secondary" icon="chevron_left" size="sm"
                        [disabled]="page() === 1"
                        (click)="setPage(page() - 1)">Anterior</app-button>
            <span class="pager__info">Página {{ page() }} de {{ totalPages() }}</span>
            <app-button variant="secondary" icon="chevron_right" size="sm"
                        [disabled]="page() === totalPages()"
                        (click)="setPage(page() + 1)">Siguiente</app-button>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .page { display: grid; gap: var(--s-4); }
    .page__head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--s-3); flex-wrap: wrap; }
    .page__head h1 { font-size: 22px; }

    .filters { display: flex; gap: var(--s-2); flex-wrap: wrap; }
    .filter { display: grid; gap: 4px; font-size: 11px; color: var(--text-muted); }
    .filter select {
      height: 36px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 0 var(--s-3);
      border-radius: var(--r-md);
      font-size: 13px;
    }

    .table-wrap {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      overflow-x: auto;
    }
    .table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .table th, .table td {
      text-align: left; padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    .table th {
      background: var(--bg-base);
      color: var(--text-muted);
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      white-space: nowrap;
    }
    .table tr:last-child td { border-bottom: 0; }
    .table tr:hover td { background: var(--bg-hover); }

    .th-time, .td-time { white-space: nowrap; }
    .td-time strong { font-size: 12px; font-variant-numeric: tabular-nums; }

    .actor { display: grid; gap: 1px; }
    .actor strong { font-size: 12px; color: var(--text); }
    .actor small { font-size: 11px; }
    .entity { color: var(--text-muted); font-family: var(--font-mono); }

    .td-meta { max-width: 320px; }
    .meta { font-size: 11px; }
    .meta summary { cursor: pointer; color: var(--text-muted); }
    .meta pre {
      margin: 4px 0 0;
      padding: 6px 8px;
      background: var(--bg-base);
      border-radius: var(--r-sm);
      font-size: 10px;
      color: var(--text-muted);
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .td-ip { color: var(--text-muted); }
    .mono { font-family: var(--font-mono); font-size: 11px; }

    .pager {
      display: flex; align-items: center; justify-content: flex-end;
      gap: var(--s-3);
      padding: var(--s-2) 0;
    }
    .pager__info { color: var(--text-muted); font-size: 12px; }

    @media (max-width: 720px) {
      .th-ip, .td-ip, .th-meta { display: none; }
    }
  `],
})
export class AuditComponent implements OnInit {
  private readonly audit = inject(AuditService);

  loading = signal(true);
  data = signal<AuditPage | null>(null);
  page = signal(1);
  readonly pageSize = 25;
  actionFilter = '';

  readonly totalPages = computed(() => {
    const d = this.data();
    if (!d) return 1;
    return Math.max(1, Math.ceil(d.total / this.pageSize));
  });

  ngOnInit(): void { this.refresh(); }

  refresh() {
    this.loading.set(true);
    this.audit.list({
      page: this.page(),
      page_size: this.pageSize,
      action: this.actionFilter || undefined,
    }).subscribe({
      next: (d) => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  onFilter() {
    this.page.set(1);
    this.refresh();
  }

  setPage(p: number) {
    this.page.set(Math.max(1, Math.min(this.totalPages(), p)));
    this.refresh();
  }

  formatMeta(meta: unknown): string {
    return JSON.stringify(meta, null, 2);
  }

  actionTone(action: string): any {
    if (action.startsWith('payment.confirm')) return 'accent';
    if (action.startsWith('payment.reject') || action.includes('failed') || action.startsWith('ticket.release')) return 'danger';
    if (action.startsWith('payment.')) return 'warning';
    if (action.startsWith('auth.login') && !action.includes('failed')) return 'info';
    if (action.includes('create') || action.includes('generate')) return 'accent';
    return 'default';
  }
}
