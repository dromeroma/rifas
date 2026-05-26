import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { SellerTierStatus } from '../models/raffle.model';
import {
  Customer,
  RaffleStats,
  SellerAssignment,
  SellerSummary,
  SellerUser,
} from '../models/stats.model';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  stats(raffleId: number): Observable<RaffleStats> {
    return this.http.get<RaffleStats>(`${this.api}/raffles/${raffleId}/stats`);
  }

  sellerTierStatus(raffleId: number, sellerId?: number): Observable<SellerTierStatus> {
    const q = sellerId != null ? `?seller_id=${sellerId}` : '';
    return this.http.get<SellerTierStatus>(
      `${this.api}/raffles/${raffleId}/seller-tier-status${q}`,
    );
  }

  listUsers(role?: 'seller' | 'admin' | 'super_admin'): Observable<SellerUser[]> {
    const q = role ? `?role=${role}` : '';
    return this.http.get<SellerUser[]>(`${this.api}/users${q}`);
  }

  /** Vendedores con métricas reales (boletas pagadas, comisión generada, etc.). */
  sellersSummary(raffleId?: number): Observable<SellerSummary[]> {
    const q = raffleId != null ? `?raffle_id=${raffleId}` : '';
    return this.http.get<SellerSummary[]>(`${this.api}/users/sellers/summary${q}`);
  }

  createUser(payload: Partial<SellerUser> & { password: string; role: SellerUser['role'] }): Observable<SellerUser> {
    return this.http.post<SellerUser>(`${this.api}/users`, payload);
  }

  listCustomers(opts: { q?: string; mine?: boolean } = {}): Observable<Customer[]> {
    const params: string[] = [];
    if (opts.q) params.push(`q=${encodeURIComponent(opts.q)}`);
    if (opts.mine) params.push('mine=true');
    const qs = params.length ? `?${params.join('&')}` : '';
    return this.http.get<Customer[]>(`${this.api}/customers${qs}`);
  }

  createCustomer(payload: Omit<Customer, 'id'>): Observable<Customer> {
    return this.http.post<Customer>(`${this.api}/customers`, payload);
  }

  listAssignments(raffleId?: number, sellerId?: number): Observable<SellerAssignment[]> {
    const params: string[] = [];
    if (raffleId !== undefined) params.push(`raffle_id=${raffleId}`);
    if (sellerId !== undefined) params.push(`seller_id=${sellerId}`);
    const q = params.length ? `?${params.join('&')}` : '';
    return this.http.get<SellerAssignment[]>(`${this.api}/assignments${q}`);
  }

  createAssignment(raffleId: number, sellerId: number, quantity: number): Observable<SellerAssignment> {
    return this.http.post<SellerAssignment>(`${this.api}/assignments`, {
      raffle_id: raffleId,
      seller_id: sellerId,
      quantity,
    });
  }

  /** Boletas de un vendedor en una rifa, listas para imprimir en hoja física. */
  printData(raffleId: number, sellerId: number, onlyUnprinted = false): Observable<unknown> {
    const q = `?seller_id=${sellerId}${onlyUnprinted ? '&only_unprinted=true' : ''}`;
    return this.http.get(`${this.api}/raffles/${raffleId}/print-data${q}`);
  }

  /** Marca un lote de boletas como impresas (printed_at = now). */
  markPrinted(raffleId: number, ticketIds: number[]): Observable<{ updated: number; printed_at: string }> {
    return this.http.post<{ updated: number; printed_at: string }>(
      `${this.api}/raffles/${raffleId}/mark-printed`,
      { ticket_ids: ticketIds },
    );
  }
}
