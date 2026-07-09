import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';

export interface PublicRaffleOverview {
  id: number;
  name: string;
  description: string | null;
  logo_url: string | null;
  primary_color: string | null;
  lottery_name: string | null;
  ticket_price: number;
  total_tickets: number;
  sold_pct: number;
  is_public: boolean;
  enable_online_purchase: boolean;
  enable_manual_transfer: boolean;
  draw_date_scheduled: boolean;
  final_draw_date: string;
  show_draw_date: boolean;
  public_welcome_message: string | null;
  prizes: Array<{
    name: string;
    position: number;
    draw_date: string | null;
    estimated_value: number | null;
  }>;
  seller: PublicSellerInfo | null;
}

export interface PublicSellerInfo {
  full_name: string;
  slug: string;
  phone: string | null;
}

export interface AvailableTicket {
  id: number;
  number_label: string;
  code: string;
}

export interface PublicTicketDetail {
  valid: boolean;
  raffle: {
    id: number;
    name: string;
    final_draw_date: string;
    lottery_name: string | null;
    responsible_name: string | null;
    responsible_phone: string | null;
    responsible_email: string | null;
    terms: string | null;
    primary_color: string | null;
  };
  ticket: {
    label: string;
    code: string;
    is_paid: boolean;
    is_winner: boolean;
    numbers: string[];
  };
  prizes: Array<{
    name: string;
    draw_date: string;
    winning_number: string | null;
  }>;
}

export interface TicketLookup {
  status: 'available' | 'sold' | 'reserved' | 'assigned' | 'not_found';
  /** Label de la boleta que CONTIENE el número buscado (ej "241"). Vacío
   *  si el número no está en ninguna boleta. */
  number_label: string;
  /** El número exacto que buscó el cliente (ej "6906"), con padding original. */
  matched_number: string;
  ticket_id: number | null;
  message: string;
}

export interface CheckoutRequest {
  ticket_ids: number[];
  customer_document: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_city?: string;
  referral_code?: string;
  seller_slug?: string;
}

export interface CheckoutResponse {
  reference: string;
  checkout_url: string | null;
  reservation_expires_at: string;
  ticket_labels: string[];
  total_amount_cents: number;
}

export interface ManualTransferRequest {
  ticket_ids: number[];
  customer_document: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_city?: string;
  amount_declared: number;
  payment_method: 'NEQUI' | 'DAVIPLATA' | 'BANCOLOMBIA_TRANSFER' | 'OTHER';
  proof_url: string;
  reference?: string;
  seller_slug?: string;
}

export interface ProofUploadResponse {
  proof_url: string;
  size_bytes: number;
}

export interface CustomerSession {
  id: number;
  full_name: string;
  email: string | null;
  phone: string;
  document: string | null;
  referral_code: string | null;
}

export interface MyTicket {
  ticket_id: number;
  raffle_id: number;
  raffle_name: string;
  number_label: string;
  code: string;
  status: string;
  paid_amount: number;
}

@Injectable({ providedIn: 'root' })
export class PublicSalesService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  overview(raffleId: number, sellerSlug?: string | null): Observable<PublicRaffleOverview> {
    const q = sellerSlug ? `?v=${encodeURIComponent(sellerSlug)}` : '';
    return this.http.get<PublicRaffleOverview>(`${this.api}/public/raffles/${raffleId}/overview${q}`);
  }

  availableTickets(
    raffleId: number, skip = 0, limit = 500, sellerSlug?: string | null,
  ): Observable<AvailableTicket[]> {
    let url = `${this.api}/public/raffles/${raffleId}/available?skip=${skip}&limit=${limit}`;
    if (sellerSlug) url += `&v=${encodeURIComponent(sellerSlug)}`;
    return this.http.get<AvailableTicket[]>(url);
  }

  lookupTicket(raffleId: number, number: string): Observable<TicketLookup> {
    const q = encodeURIComponent(number.trim());
    return this.http.get<TicketLookup>(
      `${this.api}/public/raffles/${raffleId}/lookup?number=${q}`,
    );
  }

  ticketDetail(code: string): Observable<PublicTicketDetail> {
    return this.http.get<PublicTicketDetail>(
      `${this.api}/verify/${encodeURIComponent(code)}`,
    );
  }

  checkout(raffleId: number, req: CheckoutRequest): Observable<CheckoutResponse> {
    return this.http.post<CheckoutResponse>(
      `${this.api}/public/raffles/${raffleId}/checkout`, req,
    );
  }

  manualTransfer(raffleId: number, req: ManualTransferRequest): Observable<{ submission_id: number; status: string; message: string }> {
    return this.http.post<{ submission_id: number; status: string; message: string }>(
      `${this.api}/public/raffles/${raffleId}/manual-transfer`, req,
    );
  }

  uploadProof(file: File): Observable<ProofUploadResponse> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<ProofUploadResponse>(`${this.api}/public/upload-proof`, fd);
  }

  requestMagicLink(email: string): Observable<{ sent: boolean; message: string }> {
    return this.http.post<{ sent: boolean; message: string }>(
      `${this.api}/public/auth/request-link`, { email },
    );
  }

  consumeMagicLink(token: string): Observable<CustomerSession> {
    return this.http.post<CustomerSession>(
      `${this.api}/public/auth/consume`, { token },
    );
  }

  myTickets(customerId: number): Observable<MyTicket[]> {
    return this.http.get<MyTicket[]>(
      `${this.api}/public/me/tickets?customer_id=${customerId}`,
    );
  }
}
