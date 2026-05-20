import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';

import { Raffle } from '@core/models/raffle.model';
import { RaffleStats } from '@core/models/stats.model';
import { AdminService } from '@core/services/admin.service';
import { RaffleService } from '@core/services/raffle.service';
import { CountdownComponent } from '@shared/components/countdown/countdown.component';
import {
  ButtonComponent, CardComponent, ChipComponent,
  EmptyComponent, KpiComponent, ProgressRingComponent,
} from '@shared/ui';

interface RaffleWithStats { raffle: Raffle; stats: RaffleStats | null; }

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink, CountdownComponent,
    ButtonComponent, CardComponent, ChipComponent,
    EmptyComponent, KpiComponent, ProgressRingComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit {
  private readonly raffleSvc = inject(RaffleService);
  private readonly adminSvc = inject(AdminService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly items = signal<RaffleWithStats[]>([]);
  readonly selectedIdx = signal(0);

  readonly selected = computed<RaffleWithStats | null>(() => this.items()[this.selectedIdx()] ?? null);

  ngOnInit(): void {
    this.raffleSvc.list().subscribe({
      next: (raffles) => {
        if (!raffles.length) {
          this.items.set([]);
          this.loading.set(false);
          return;
        }
        forkJoin(
          raffles.map((r) =>
            r.numbers_generated ? this.adminSvc.stats(r.id) : of(null),
          ),
        ).subscribe((statsList) => {
          this.items.set(raffles.map((r, i) => ({ raffle: r, stats: statsList[i] })));
          this.loading.set(false);
        });
      },
      error: () => this.loading.set(false),
    });
  }

  selectRaffle(idx: number) { this.selectedIdx.set(idx); }
  goToRaffle(id: number) { this.router.navigate(['/admin/raffles', id]); }

  statusLabel(s: string): string {
    return ({
      available: 'Disponibles',
      reserved: 'Reservadas',
      pending_payment: 'Pendientes pago',
      paid: 'Pagadas',
      expired: 'Expiradas',
      winning: 'Ganadoras',
    } as Record<string, string>)[s] ?? s;
  }

  fmtMoney(v: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);
  }
}
