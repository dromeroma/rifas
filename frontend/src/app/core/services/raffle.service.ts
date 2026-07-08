import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import { Prize, Raffle, RaffleUpdatePayload, Ticket } from '../models/raffle.model';

export type PrizeCreatePayload = Omit<Prize, 'id' | 'raffle_id' | 'winning_number'>;
export type PrizeUpdatePayload = Partial<Omit<Prize, 'id' | 'raffle_id' | 'winning_number'>>;

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

  uploadLogo(id: number, file: File): Observable<Raffle> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<Raffle>(`${this.base}/${id}/logo`, fd);
  }

  addPrize(raffleId: number, payload: PrizeCreatePayload): Observable<Prize> {
    return this.http.post<Prize>(`${this.base}/${raffleId}/prizes`, payload);
  }

  updatePrize(raffleId: number, prizeId: number, payload: PrizeUpdatePayload): Observable<Prize> {
    return this.http.patch<Prize>(`${this.base}/${raffleId}/prizes/${prizeId}`, payload);
  }

  deletePrize(raffleId: number, prizeId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${raffleId}/prizes/${prizeId}`);
  }

  postpone(raffleId: number, payload: {
    new_final_draw_date: string;
    reason?: string;
    prize_dates?: { prize_id: number; new_draw_date: string }[];
  }): Observable<Raffle> {
    return this.http.post<Raffle>(`${this.base}/${raffleId}/postpone`, payload);
  }

  cancel(raffleId: number, payload: {
    reason: string;
    refund_contact?: string;
    refund_message?: string;
  }): Observable<Raffle> {
    return this.http.post<Raffle>(`${this.base}/${raffleId}/cancel`, payload);
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

  reservePackage(payload: { raffle_id: number; package_size: number; customer_id: number }): Observable<{
    reserved: number;
    raffle_id: number;
    customer_id: number;
    ticket_ids: number[];
    labels: string[];
    numbers: string[];
  }> {
    return this.http.post<any>(
      `${environment.apiUrl}/tickets/reserve-package`,
      payload,
    );
  }

  release(ticketId: number): Observable<Ticket> {
    return this.http.post<Ticket>(`${environment.apiUrl}/tickets/${ticketId}/release`, {});
  }

  markPaid(ticketId: number): Observable<Ticket> {
    return this.http.post<Ticket>(`${environment.apiUrl}/tickets/${ticketId}/mark-paid`, {});
  }

  /** Extiende la reserva activa de una boleta N horas (admin). */
  extendReservation(ticketId: number, hours = 24): Observable<Ticket> {
    return this.http.post<Ticket>(
      `${environment.apiUrl}/tickets/${ticketId}/extend-reservation`,
      { hours },
    );
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
