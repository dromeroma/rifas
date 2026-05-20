import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import {
  Customer,
  RaffleStats,
  SellerAssignment,
  SellerUser,
} from '../models/stats.model';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  stats(raffleId: number): Observable<RaffleStats> {
    return this.http.get<RaffleStats>(`${this.api}/raffles/${raffleId}/stats`);
  }

  listUsers(role?: 'seller' | 'admin' | 'super_admin'): Observable<SellerUser[]> {
    const q = role ? `?role=${role}` : '';
    return this.http.get<SellerUser[]>(`${this.api}/users${q}`);
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
}
