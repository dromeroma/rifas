import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { Raffle, RaffleUpdatePayload, Ticket } from '../models/raffle.model';

@Injectable({ providedIn: 'root' })
export class RaffleService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/raffles`;

  list(): Observable<Raffle[]> {
    return this.http.get<Raffle[]>(this.base);
  }

  get(id: number): Observable<Raffle> {
    return this.http.get<Raffle>(`${this.base}/${id}`);
  }

  create(payload: Partial<Raffle> & { prizes: Partial<Raffle['prizes'][number]>[] }): Observable<Raffle> {
    return this.http.post<Raffle>(this.base, payload);
  }

  generateNumbers(id: number): Observable<Raffle> {
    return this.http.post<Raffle>(`${this.base}/${id}/generate-numbers`, {});
  }

  update(id: number, payload: RaffleUpdatePayload): Observable<Raffle> {
    return this.http.patch<Raffle>(`${this.base}/${id}`, payload);
  }

  tickets(raffleId: number): Observable<Ticket[]> {
    return this.http.get<Ticket[]>(`${this.base}/${raffleId}/tickets`);
  }

  ticket(id: number): Observable<Ticket> {
    return this.http.get<Ticket>(`${environment.apiUrl}/tickets/${id}`);
  }

  reserve(ticketId: number, customerId?: number): Observable<Ticket> {
    return this.http.post<Ticket>(`${environment.apiUrl}/tickets/${ticketId}/reserve`, {
      customer_id: customerId,
    });
  }

  release(ticketId: number): Observable<Ticket> {
    return this.http.post<Ticket>(`${environment.apiUrl}/tickets/${ticketId}/release`, {});
  }

  markPaid(ticketId: number): Observable<Ticket> {
    return this.http.post<Ticket>(`${environment.apiUrl}/tickets/${ticketId}/mark-paid`, {});
  }

  /** Descarga PDF como blob (pasa por el interceptor → lleva JWT). */
  ticketPdf(ticketId: number): Observable<Blob> {
    return this.http.get(`${environment.apiUrl}/tickets/${ticketId}/pdf`, {
      responseType: 'blob',
    });
  }

  /** Descarga PNG como blob para compartir por WhatsApp. */
  ticketImage(ticketId: number): Observable<Blob> {
    return this.http.get(`${environment.apiUrl}/tickets/${ticketId}/image`, {
      responseType: 'blob',
    });
  }
}
