import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';

import { Raffle } from '@core/models/raffle.model';
import { RaffleStats } from '@core/models/stats.model';
import { AdminService } from '@core/services/admin.service';
import { AuthService } from '@core/services/auth.service';
import { RaffleService } from '@core/services/raffle.service';
import { CountdownComponent } from '@shared/components/countdown/countdown.component';
import {
  ButtonComponent, CardComponent, ChipComponent,
  EmptyComponent, KpiComponent, ProgressRingComponent,
} from '@shared/ui';
import { OnboardingCardComponent } from './onboarding-card.component';

interface RaffleWithStats { raffle: Raffle; stats: RaffleStats | null; }

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink, CountdownComponent,
    ButtonComponent, CardComponent, ChipComponent,
    EmptyComponent, KpiComponent, ProgressRingComponent,
    OnboardingCardComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class AdminDashboardComponent implements OnInit {
  private readonly raffleSvc = inject(RaffleService);
  private readonly adminSvc = inject(AdminService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly items = signal<RaffleWithStats[]>([]);
  readonly selectedIdx = signal(0);
  readonly sellersCount = signal(0);

  readonly raffles = computed(() => this.items().map((i) => i.raffle));

  readonly selected = computed<RaffleWithStats | null>(() => this.items()[this.selectedIdx()] ?? null);

  /** Información de cupo de rifas: usadas, máximas, restantes y porcentaje. */
  readonly quota = computed(() => {
    const t = this.auth.user()?.tenant;
    if (!t) return null;  // super_admin u otro contexto sin tenant
    const used = this.items().length;
    const max = t.max_raffles;
    const remaining = Math.max(max - used, 0);
    const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
    return {
      used,
      max,
      remaining,
      pct: Number(pct.toFixed(2)),
      tenantName: t.name,
      isReached: used >= max,
    };
  });

  ngOnInit(): void {
    // Cargar sellers en paralelo (para el onboarding)
    this.adminSvc.listUsers('seller').subscribe({
      next: (sellers) => this.sellersCount.set(sellers.length),
      error: () => this.sellersCount.set(0),
    });

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

  fmtPct(v: number): string {
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(v);
  }
}
