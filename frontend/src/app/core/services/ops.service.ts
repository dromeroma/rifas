import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { Ticket } from '../models/raffle.model';

export interface ExpireResult { released: number; }

export interface DrawWinnerResult {
  prize_id: number;
  prize_name: string;
  winning_number: string;
  ticket_id: number | null;
  ticket_label: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  is_paid: boolean;
}

export interface CustomerTickets {
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  tickets: Ticket[];
}

@Injectable({ providedIn: 'root' })
export class OpsService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  expireReservations(): Observable<ExpireResult> {
    return this.http.post<ExpireResult>(`${this.api}/admin/expire-reservations`, {});
  }

  drawWinner(raffleId: number, prizeId: number, winningNumber: string): Observable<DrawWinnerResult> {
    return this.http.post<DrawWinnerResult>(`${this.api}/admin/raffles/${raffleId}/draw`, {
      prize_id: prizeId,
      winning_number: winningNumber,
    });
  }

  customerTickets(customerId: number): Observable<CustomerTickets> {
    return this.http.get<CustomerTickets>(`${this.api}/admin/customers/${customerId}/tickets`);
  }
}
