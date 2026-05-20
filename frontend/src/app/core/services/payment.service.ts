import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import {
  AuditPage, Payment, PaymentListItem, PaymentMethod, PaymentStatus,
} from '../models/payment.model';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  /** Reporta un pago para una boleta con comprobante opcional (multipart). */
  submit(ticketId: number, payload: {
    method: PaymentMethod;
    amount: number;
    reference?: string;
    notes?: string;
    proof?: File | null;
  }): Observable<Payment> {
    const form = new FormData();
    form.append('method', payload.method);
    form.append('amount', String(payload.amount));
    if (payload.reference) form.append('reference', payload.reference);
    if (payload.notes) form.append('notes', payload.notes);
    if (payload.proof) form.append('proof', payload.proof);
    return this.http.post<Payment>(`${this.api}/payments/tickets/${ticketId}/submit`, form);
  }

  list(status?: PaymentStatus): Observable<PaymentListItem[]> {
    const q = status ? `?status_filter=${status}` : '';
    return this.http.get<PaymentListItem[]>(`${this.api}/payments${q}`);
  }

  confirm(id: number): Observable<Payment> {
    return this.http.post<Payment>(`${this.api}/payments/${id}/confirm`, {});
  }

  reject(id: number, reason: string): Observable<Payment> {
    return this.http.post<Payment>(`${this.api}/payments/${id}/reject`, { reason });
  }

  /** Descarga el archivo del comprobante como blob (lleva JWT por interceptor). */
  proof(id: number): Observable<Blob> {
    return this.http.get(`${this.api}/payments/${id}/proof`, { responseType: 'blob' });
  }
}


@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  list(opts: {
    page?: number;
    page_size?: number;
    action?: string;
    actor_id?: number;
    entity_type?: string;
  } = {}): Observable<AuditPage> {
    const params: string[] = [];
    if (opts.page) params.push(`page=${opts.page}`);
    if (opts.page_size) params.push(`page_size=${opts.page_size}`);
    if (opts.action) params.push(`action=${encodeURIComponent(opts.action)}`);
    if (opts.actor_id !== undefined) params.push(`actor_id=${opts.actor_id}`);
    if (opts.entity_type) params.push(`entity_type=${encodeURIComponent(opts.entity_type)}`);
    const qs = params.length ? `?${params.join('&')}` : '';
    return this.http.get<AuditPage>(`${this.api}/audit-logs${qs}`);
  }
}
