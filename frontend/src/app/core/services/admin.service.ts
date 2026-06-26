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

export interface AssignmentTicketDTO {
  id: number;
  number_label: string;
  code: string;
  status:
    | 'available' | 'reserved' | 'pending_payment'
    | 'partially_paid' | 'paid' | 'expired' | 'winning';
  has_customer: boolean;
  paid_amount: number;
}

export interface RaffleAssignmentDetail {
  raffle_id: number;
  raffle_name: string;
  raffle_status: string;
  final_draw_date: string;
  total_tickets: number;
  assigned_count: number;
  removable_count: number;
  available_pool: number;
  tickets: AssignmentTicketDTO[];
}

export interface NumberSearchResult {
  found: boolean;
  number: string;
  message?: string;
  scoped_to_seller?: boolean;
  position_in_field?: number;
  ticket?: {
    id: number;
    number_label: string;
    code: string;
    status: string;
    all_numbers: string[];
    customer: { id: number; full_name: string; phone: string } | null;
    seller: { id: number; full_name: string; phone: string | null } | null;
  };
}

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

  /** Detalle de las asignaciones de un vendedor: por rifa, con todas sus boletas. */
  sellerAssignmentsDetail(sellerId: number): Observable<RaffleAssignmentDetail[]> {
    return this.http.get<RaffleAssignmentDetail[]>(
      `${this.api}/assignments/seller/${sellerId}/detail`,
    );
  }

  /** Quita boletas a un vendedor. Solo se aceptan boletas `available` sin reserva. */
  unassignTickets(
    raffleId: number,
    sellerId: number,
    body: { ticket_ids?: number[]; quantity?: number },
  ): Observable<{ unassigned: number; ticket_ids: number[] }> {
    return this.http.post<{ unassigned: number; ticket_ids: number[] }>(
      `${this.api}/assignments/raffles/${raffleId}/seller/${sellerId}/unassign`,
      body,
    );
  }

  /** Asigna N boletas más al vendedor desde el pool disponible. */
  assignMore(
    raffleId: number,
    sellerId: number,
    quantity: number,
  ): Observable<{ assigned: number; requested: number; labels: string[]; partial: boolean }> {
    return this.http.post<{ assigned: number; requested: number; labels: string[]; partial: boolean }>(
      `${this.api}/assignments/raffles/${raffleId}/seller/${sellerId}/assign-more`,
      { quantity },
    );
  }

  /** Boletas de un vendedor en una rifa, listas para imprimir en hoja física. */
  printData(raffleId: number, sellerId: number, onlyUnprinted = false): Observable<unknown> {
    const q = `?seller_id=${sellerId}${onlyUnprinted ? '&only_unprinted=true' : ''}`;
    return this.http.get(`${this.api}/raffles/${raffleId}/print-data${q}`);
  }

  /** Boletas por rango (sin importar a quién están asignadas). */
  printDataRange(
    raffleId: number,
    fromLabel: string,
    toLabel: string,
    onlyUnprinted = false,
  ): Observable<unknown> {
    const q =
      `?from_label=${encodeURIComponent(fromLabel)}&to_label=${encodeURIComponent(toLabel)}` +
      (onlyUnprinted ? '&only_unprinted=true' : '');
    return this.http.get(`${this.api}/raffles/${raffleId}/print-data${q}`);
  }

  /** Busca qué boleta contiene un número específico. El backend escopa
   *  automáticamente según rol: admin ve todo, seller solo lo suyo. */
  searchByNumber(raffleId: number, n: string): Observable<NumberSearchResult> {
    return this.http.get<NumberSearchResult>(
      `${this.api}/raffles/${raffleId}/search-number?n=${encodeURIComponent(n)}`,
    );
  }

  /** Marca un lote de boletas como impresas (printed_at = now). */
  markPrinted(raffleId: number, ticketIds: number[]): Observable<{ updated: number; printed_at: string }> {
    return this.http.post<{ updated: number; printed_at: string }>(
      `${this.api}/raffles/${raffleId}/mark-printed`,
      { ticket_ids: ticketIds },
    );
  }

  /** Verifica que ningún número esté duplicado en las boletas de la rifa.
   *  Crítico: un número repetido permitiría que varias personas reclamen
   *  el mismo premio. El sistema ya tiene 2 capas de protección, pero este
   *  endpoint permite re-validar bajo demanda antes del sorteo. */
  integrityCheck(raffleId: number): Observable<IntegrityCheckResult> {
    return this.http.get<IntegrityCheckResult>(
      `${this.api}/raffles/${raffleId}/integrity-check`,
    );
  }
}

export interface IntegrityCheckResult {
  ok: boolean;
  total_numbers: number;
  unique_numbers: number;
  expected_numbers: number;
  duplicates: Array<{ number: string; count: number; boletas: string[] }>;
  missing_tickets: Array<{ boleta: string; numeros_actuales: number }>;
  summary: string;
}
