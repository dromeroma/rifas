/**
 * PerksApiService — cliente HTTP tipado del admin panel de Perks.
 *
 * Consume /api/v1/customers/* y /api/v1/rules/* del backend
 * (Sprint 6a). Endpoints gated por el feature flag `perks.admin_api`
 * — con flag off el server devuelve 404 en todo.
 *
 * Errores estructurados: el backend devuelve
 *   { detail: { code, message, ...extra } }
 * en 4xx. Se re-lanzan como PerksApiError para que las vistas
 * puedan reaccionar por `code`.
 */
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';

// ────────────────────────────────────────────────────────────────
// Types compartidos con el backend
// ────────────────────────────────────────────────────────────────

export type IdentityKind = 'email' | 'phone' | 'document' | 'external';

export type NotificationChannel = 'email' | 'sms' | 'whatsapp' | 'push';

export type ConsentAction = 'granted' | 'revoked';

export type ExecutionStatus =
  | 'fired'
  | 'skipped'
  | 'rate_limited'
  | 'cooled_down'
  | 'errored';

// ── Customer ──────────────────────────────────────────────

export interface IdentityIn {
  kind: IdentityKind;
  value: string;
}

export interface IdentityOut {
  id: number;
  customer_id: number;
  kind: IdentityKind;
  value: string;
  verified: boolean;
  verified_at?: string | null;
}

export interface PreferenceIn {
  channel: NotificationChannel;
  allowed: boolean;
  settings?: Record<string, unknown>;
}

export interface PreferenceOut {
  id: number;
  channel: NotificationChannel;
  allowed: boolean;
  settings: Record<string, unknown>;
  updated_at: string;
}

export interface ConsentIn {
  purpose: string;
  action?: ConsentAction;
  source: string;
  evidence?: Record<string, unknown>;
  policy_version?: string | null;
  notes?: string | null;
}

export interface ConsentOut {
  id: number;
  customer_id: number;
  purpose: string;
  action: ConsentAction;
  source: string;
  policy_version?: string | null;
  granted_at: string;
}

export interface IdentifyRequest {
  identity: IdentityIn;
  full_name?: string | null;
  additional_identities?: IdentityIn[];
  source?: string | null;
}

export interface IdentifyResult {
  customer_id: number;
  first_time: boolean;
  identities: IdentityOut[];
}

export interface CustomerSummary {
  id: number;
  tenant_id: number;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  document?: string | null;
  identities_count?: number;
  active_vouchers?: number;
}

export interface CustomerDetail {
  id: number;
  tenant_id: number;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  document?: string | null;
  identities: IdentityOut[];
  preferences: PreferenceOut[];
  recent_consents: ConsentOut[];
}

export interface CustomerListResponse {
  items: CustomerSummary[];
  total: number;
  limit: number;
  offset: number;
}

// ── Wallet ────────────────────────────────────────────────

export type BalanceType =
  | 'points'
  | 'xp'
  | 'cashback_cop'
  | 'credit_seconds'
  | 'visits'
  | 'stamps';

export interface BalanceOut {
  balance_type: BalanceType;
  amount: string | number;   // Decimal se serializa como string
  updated_at: string;
}

export interface WalletSnapshot {
  id: number;
  tenant_id: number;
  customer_id: number;
  balances: BalanceOut[];
  active_vouchers: number;
}

// ── Rules ─────────────────────────────────────────────────

export interface RuleListItem {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  category?: string | null;
  enabled: boolean;
  trigger_event_type: string;
  active_version_id?: number | null;
}

export interface RuleListResponse {
  items: RuleListItem[];
  total: number;
}

export interface RuleOut {
  id: number;
  tenant_id: number;
  code: string;
  name: string;
  description?: string | null;
  category?: string | null;
  enabled: boolean;
  trigger_event_type: string;
  active_version_id?: number | null;
  active_version?: number | null;
  created_at: string;
  updated_at: string;
}

export interface RuleDetail {
  rule: RuleOut;
  active_dsl?: Record<string, unknown> | null;
}

export interface RuleCreateRequest {
  code: string;
  definition: RuleDefinition;
}

export interface RuleUpdateRequest {
  definition: RuleDefinition;
  change_note?: string;
}

export interface RuleDefinition {
  name: string;
  description?: string | null;
  category?: string | null;
  enabled?: boolean;
  trigger: { event: string };
  conditions?: Record<string, unknown> | null;
  actions: Array<{
    type: string;
    params?: Record<string, unknown>;
  }>;
  limits?: {
    per_customer_per_day?: number | null;
    per_customer_per_month?: number | null;
    per_customer_lifetime?: number | null;
    global_per_day?: number | null;
  };
  cooldown_seconds?: number;
}

export interface DryRunRequest {
  event_type: string;
  event_data?: Record<string, unknown>;
  customer_id?: number | null;
}

export interface DryRunResult {
  status: ExecutionStatus;
  matched_conditions: boolean;
  actions_planned: Array<{ type: string; params: Record<string, unknown> }>;
  resolved_paths: Record<string, unknown>;
  limits_check: Record<string, unknown>;
  error?: string | null;
  latency_ms?: number | null;
}

export interface RuleExecutionOut {
  id: number;
  rule_id: number;
  rule_version_id: number;
  event_id: string;
  event_type: string;
  customer_id?: number | null;
  status: ExecutionStatus;
  actions_applied: Record<string, unknown>[];
  error?: string | null;
  latency_ms?: number | null;
  dry_run: boolean;
  created_at: string;
}

export interface ExecutionsResponse {
  items: RuleExecutionOut[];
}

// ────────────────────────────────────────────────────────────────
// Errores tipados
// ────────────────────────────────────────────────────────────────

export interface StructuredErrorDetail {
  code?: string;
  message?: string;
  [extra: string]: unknown;
}

export class PerksApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: StructuredErrorDetail | string | null,
    message: string,
  ) {
    super(message);
    this.name = 'PerksApiError';
  }

  get code(): string | null {
    if (
      this.detail &&
      typeof this.detail === 'object' &&
      typeof this.detail.code === 'string'
    ) {
      return this.detail.code;
    }
    return null;
  }

  get userMessage(): string {
    if (
      this.detail &&
      typeof this.detail === 'object' &&
      typeof this.detail.message === 'string'
    ) {
      return this.detail.message;
    }
    if (typeof this.detail === 'string') return this.detail;
    return this.message;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isConflict(): boolean {
    return this.status === 409;
  }
  get isValidation(): boolean {
    return this.status === 422;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
}

function toPerksError(err: unknown): Observable<never> {
  if (err instanceof HttpErrorResponse) {
    const detail = (err.error && err.error.detail) ?? err.error ?? null;
    return throwError(
      () =>
        new PerksApiError(
          err.status,
          detail,
          typeof detail === 'string'
            ? detail
            : detail?.message ?? err.message ?? 'error de red',
        ),
    );
  }
  return throwError(() => err);
}

// ────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class PerksApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl.replace(/\/$/, '') + '/api/v1';

  // ── Customers ────────────────────────────────────────────
  listCustomers(opts?: {
    q?: string;
    limit?: number;
    offset?: number;
  }): Observable<CustomerListResponse> {
    let params = new HttpParams();
    if (opts?.q) params = params.set('q', opts.q);
    if (opts?.limit != null) params = params.set('limit', String(opts.limit));
    if (opts?.offset != null) params = params.set('offset', String(opts.offset));
    return this.http
      .get<CustomerListResponse>(`${this.base}/customers`, { params })
      .pipe(catchError(toPerksError));
  }

  getCustomer(id: number): Observable<CustomerDetail> {
    return this.http
      .get<CustomerDetail>(`${this.base}/customers/${id}`)
      .pipe(catchError(toPerksError));
  }

  identify(payload: IdentifyRequest): Observable<IdentifyResult> {
    return this.http
      .post<IdentifyResult>(`${this.base}/customers/identify`, payload)
      .pipe(catchError(toPerksError));
  }

  addIdentity(customerId: number, payload: IdentityIn): Observable<IdentityOut> {
    return this.http
      .post<IdentityOut>(
        `${this.base}/customers/${customerId}/identities`,
        payload,
      )
      .pipe(catchError(toPerksError));
  }

  setPreference(
    customerId: number,
    payload: PreferenceIn,
  ): Observable<PreferenceOut> {
    return this.http
      .post<PreferenceOut>(
        `${this.base}/customers/${customerId}/preferences`,
        payload,
      )
      .pipe(catchError(toPerksError));
  }

  recordConsent(
    customerId: number,
    payload: ConsentIn,
  ): Observable<ConsentOut> {
    return this.http
      .post<ConsentOut>(
        `${this.base}/customers/${customerId}/consents`,
        payload,
      )
      .pipe(catchError(toPerksError));
  }

  getWallet(customerId: number): Observable<WalletSnapshot> {
    return this.http
      .get<WalletSnapshot>(`${this.base}/customers/${customerId}/wallet`)
      .pipe(catchError(toPerksError));
  }

  // ── Rules ────────────────────────────────────────────────
  listRules(opts?: {
    enabled?: boolean;
    trigger_event_type?: string;
    limit?: number;
  }): Observable<RuleListResponse> {
    let params = new HttpParams();
    if (opts?.enabled != null) params = params.set('enabled', String(opts.enabled));
    if (opts?.trigger_event_type)
      params = params.set('trigger_event_type', opts.trigger_event_type);
    if (opts?.limit != null) params = params.set('limit', String(opts.limit));
    return this.http
      .get<RuleListResponse>(`${this.base}/rules`, { params })
      .pipe(catchError(toPerksError));
  }

  getRule(id: number): Observable<RuleDetail> {
    return this.http
      .get<RuleDetail>(`${this.base}/rules/${id}`)
      .pipe(catchError(toPerksError));
  }

  createRule(payload: RuleCreateRequest): Observable<RuleOut> {
    return this.http
      .post<RuleOut>(`${this.base}/rules`, payload)
      .pipe(catchError(toPerksError));
  }

  updateRule(id: number, payload: RuleUpdateRequest): Observable<RuleOut> {
    return this.http
      .put<RuleOut>(`${this.base}/rules/${id}`, payload)
      .pipe(catchError(toPerksError));
  }

  enableRule(id: number): Observable<RuleOut> {
    return this.http
      .post<RuleOut>(`${this.base}/rules/${id}/enable`, {})
      .pipe(catchError(toPerksError));
  }

  disableRule(id: number): Observable<RuleOut> {
    return this.http
      .post<RuleOut>(`${this.base}/rules/${id}/disable`, {})
      .pipe(catchError(toPerksError));
  }

  dryRun(id: number, payload: DryRunRequest): Observable<DryRunResult> {
    return this.http
      .post<DryRunResult>(`${this.base}/rules/${id}/dry-run`, payload)
      .pipe(catchError(toPerksError));
  }

  listExecutions(
    id: number,
    opts?: { limit?: number },
  ): Observable<ExecutionsResponse> {
    let params = new HttpParams();
    if (opts?.limit != null) params = params.set('limit', String(opts.limit));
    return this.http
      .get<ExecutionsResponse>(`${this.base}/rules/${id}/executions`, { params })
      .pipe(catchError(toPerksError));
  }
}
