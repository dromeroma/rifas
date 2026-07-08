import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';

export interface WompiConfig {
  public_key: string;
  env: 'sandbox' | 'production';
  private_key_configured: boolean;
  webhook_secret_configured: boolean;
  integrity_key_configured: boolean;
}

export interface WompiConfigInput {
  public_key: string;
  private_key: string;
  webhook_secret: string;
  integrity_key: string;
  env: 'sandbox' | 'production';
}

export interface RafflePublicConfig {
  is_public?: boolean;
  enable_online_purchase?: boolean;
  enable_manual_transfer?: boolean;
  draw_threshold_pct?: number;
  public_welcome_message?: string;
}

export interface ManualTransferSubmission {
  id: number;
  raffle_name: string;
  raffle_id: number;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  ticket_ids: number[];
  amount_declared: number;
  payment_method: string;
  proof_url: string;
  reference: string | null;
  status: string;
  submitted_at: string;
}

@Injectable({ providedIn: 'root' })
export class PublicSalesAdminService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  getWompiConfig(): Observable<WompiConfig> {
    return this.http.get<WompiConfig>(`${this.api}/admin/public-sales/wompi-config`);
  }

  updateWompiConfig(cfg: WompiConfigInput): Observable<WompiConfig> {
    return this.http.put<WompiConfig>(`${this.api}/admin/public-sales/wompi-config`, cfg);
  }

  updateRafflePublicConfig(raffleId: number, cfg: RafflePublicConfig): Observable<{ updated: any }> {
    return this.http.patch<{ updated: any }>(
      `${this.api}/admin/public-sales/raffles/${raffleId}/public-config`, cfg,
    );
  }

  scheduleDraw(raffleId: number, confirmedDate: string): Observable<{ scheduled: boolean; date: string; customers_notified: number }> {
    return this.http.post<any>(
      `${this.api}/admin/public-sales/raffles/${raffleId}/schedule-draw`,
      { confirmed_date: confirmedDate },
    );
  }

  listManualTransfers(status = 'PENDING'): Observable<ManualTransferSubmission[]> {
    return this.http.get<ManualTransferSubmission[]>(
      `${this.api}/admin/public-sales/manual-transfers?status_filter=${status}`,
    );
  }

  reviewTransfer(submissionId: number, approve: boolean, notes?: string): Observable<{ submission_id: number; status: string }> {
    return this.http.post<any>(
      `${this.api}/admin/public-sales/manual-transfers/${submissionId}/review`,
      { approve, notes },
    );
  }
}
