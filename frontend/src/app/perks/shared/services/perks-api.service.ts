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

// ── Overview ──────────────────────────────────────────────

export interface OverviewCounters {
  customers_total: number;
  wallets_total: number;
  rules_total: number;
  rules_active: number;
  events_last_24h: number;
  executions_last_7d: number;
  executions_fired_last_7d: number;
  executions_errored_last_7d: number;
}

export interface TopRule {
  rule_id: number;
  code: string;
  name: string;
  fires_last_7d: number;
}

export interface RecentExecution {
  id: number;
  rule_id: number;
  rule_code: string;
  rule_name: string;
  event_type: string;
  customer_id?: number | null;
  status: ExecutionStatus;
  latency_ms?: number | null;
  created_at: string;
}

export interface RecentEvent {
  id: number;
  event_id: string;
  type: string;
  subject_kind?: string | null;
  subject_id?: string | null;
  occurred_at: string;
}

export interface OverviewResponse {
  counters: OverviewCounters;
  top_rules: TopRule[];
  recent_executions: RecentExecution[];
  recent_events: RecentEvent[];
}

// ── Tenant profile ────────────────────────────────────────

export type TenantStatus = 'draft' | 'active' | 'paused' | 'archived';

export type TenantVertical =
  | 'retail' | 'restaurant' | 'gym' | 'isp' | 'saas' | 'service'
  | 'hospitality' | 'education' | 'healthcare' | 'other';

export interface TenantProfileIn {
  brand_name?: string | null;
  brand_color_primary?: string | null;
  brand_color_secondary?: string | null;
  brand_logo_url?: string | null;
  vertical?: TenantVertical | null;
  timezone?: string | null;
  locale?: string | null;
  currency?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  support_url?: string | null;
}

export interface TenantProfileOut {
  tenant_id: number;
  brand_name: string | null;
  brand_color_primary: string | null;
  brand_color_secondary: string | null;
  brand_logo_url: string | null;
  vertical: TenantVertical | null;
  timezone: string;
  locale: string;
  currency: string;
  contact_email: string | null;
  contact_phone: string | null;
  support_url: string | null;
  status: TenantStatus;
  activated_at: string | null;
  activated_by: string | null;
  paused_at: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Analytics ─────────────────────────────────────────────

export type AnalyticsWindow = '1h' | '24h' | '7d' | '30d';

export interface ActivityItem {
  id: number;
  event_id: string;
  type: string;
  tenant_id: number | null;
  actor_kind: string | null;
  actor_id: string | null;
  subject_kind: string | null;
  subject_id: string | null;
  occurred_at: string;
  data: Record<string, unknown>;
  trigger_event_id: string | null;
}

export interface ActivityResponse {
  items: ActivityItem[];
  next_before_id: number | null;
  limit: number;
}

export interface TimelineEntry {
  kind: 'event' | 'rule_exec' | 'notification' | 'wallet_ledger';
  when: string;
  title: string;
  subtitle: string | null;
  payload: Record<string, unknown>;
}

export interface TimelineResponse {
  customer_id: number;
  entries: TimelineEntry[];
}

export interface KpisResponse {
  window: AnalyticsWindow;
  customers_total: number;
  customers_new_in_window: number;
  wallets_total: number;
  events_in_window: number;
  events_by_type: Record<string, number>;
  executions_in_window: number;
  executions_fired: number;
  executions_errored: number;
  executions_skipped: number;
  notifications_sent: number;
  notifications_delivered: number;
  notifications_failed: number;
  notifications_blocked: number;
  wallet_points_credited: string;
  wallet_points_debited: string;
}

export interface RuleStat {
  rule_id: number;
  code: string;
  name: string;
  fires: number;
  errored: number;
  skipped: number;
  avg_latency_ms: number | null;
  error_rate: number;
}

export interface RulesLeaderboardResponse {
  window: AnalyticsWindow;
  rules: RuleStat[];
}

export interface ChannelStat {
  channel: string;
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
  blocked: number;
  success_rate: number;
}

export interface ChannelsResponse {
  window: AnalyticsWindow;
  channels: ChannelStat[];
}

export interface HistogramBucket {
  bucket_start: string;
  total: number;
  by_type: Record<string, number>;
}

export interface HistogramResponse {
  window: AnalyticsWindow;
  bucket: string;
  buckets: HistogramBucket[];
}

// ── Onboarding ────────────────────────────────────────────

export type OnboardingStepStatus =
  | 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface OnboardingStep {
  key: string;
  title: string;
  description: string;
  required: boolean;
  weight: number;
  cta: string | null;
  status: OnboardingStepStatus;
  completed_at: string | null;
  completed_by: string | null;
  trigger_event_id: string | null;
  meta: Record<string, unknown>;
}

export interface OnboardingChecklist {
  tenant_id: number;
  steps: OnboardingStep[];
  total: number;
  completed: number;
  skipped: number;
  pending: number;
  progress: number;
  required_missing: string[];
  activation_ready: boolean;
  activated: boolean;
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

  // ── Overview ─────────────────────────────────────────────
  getOverview(): Observable<OverviewResponse> {
    return this.http
      .get<OverviewResponse>(`${this.base}/overview`)
      .pipe(catchError(toPerksError));
  }

  // ── Tenant profile ───────────────────────────────────────
  getTenantProfile(): Observable<TenantProfileOut> {
    return this.http
      .get<TenantProfileOut>(`${this.base}/tenant/me/profile`)
      .pipe(catchError(toPerksError));
  }

  updateTenantProfile(payload: TenantProfileIn): Observable<TenantProfileOut> {
    return this.http
      .put<TenantProfileOut>(`${this.base}/tenant/me/profile`, payload)
      .pipe(catchError(toPerksError));
  }

  pauseTenant(reason?: string): Observable<TenantProfileOut> {
    return this.http
      .post<TenantProfileOut>(`${this.base}/tenant/me/pause`, { reason })
      .pipe(catchError(toPerksError));
  }

  // ── Onboarding ───────────────────────────────────────────
  getOnboarding(): Observable<OnboardingChecklist> {
    return this.http
      .get<OnboardingChecklist>(`${this.base}/onboarding`)
      .pipe(catchError(toPerksError));
  }

  completeOnboardingStep(key: string): Observable<OnboardingStep> {
    return this.http
      .post<OnboardingStep>(
        `${this.base}/onboarding/steps/${key}/complete`,
        {},
      )
      .pipe(catchError(toPerksError));
  }

  skipOnboardingStep(key: string, reason?: string): Observable<OnboardingStep> {
    return this.http
      .post<OnboardingStep>(
        `${this.base}/onboarding/steps/${key}/skip`,
        { reason },
      )
      .pipe(catchError(toPerksError));
  }

  reopenOnboardingStep(key: string): Observable<OnboardingStep> {
    return this.http
      .post<OnboardingStep>(
        `${this.base}/onboarding/steps/${key}/reopen`,
        {},
      )
      .pipe(catchError(toPerksError));
  }

  activateTenant(): Observable<TenantProfileOut> {
    return this.http
      .post<TenantProfileOut>(`${this.base}/onboarding/activate`, {})
      .pipe(catchError(toPerksError));
  }

  // ── Analytics ────────────────────────────────────────────
  getActivity(opts?: {
    limit?: number;
    before_id?: number;
    type_prefix?: string;
    subject_kind?: string;
  }): Observable<ActivityResponse> {
    let params = new HttpParams();
    if (opts?.limit != null) params = params.set('limit', String(opts.limit));
    if (opts?.before_id != null)
      params = params.set('before_id', String(opts.before_id));
    if (opts?.type_prefix) params = params.set('type_prefix', opts.type_prefix);
    if (opts?.subject_kind) params = params.set('subject_kind', opts.subject_kind);
    return this.http
      .get<ActivityResponse>(`${this.base}/analytics/activity`, { params })
      .pipe(catchError(toPerksError));
  }

  getCustomerTimeline(
    customerId: number,
    opts?: { limit?: number },
  ): Observable<TimelineResponse> {
    let params = new HttpParams();
    if (opts?.limit != null) params = params.set('limit', String(opts.limit));
    return this.http
      .get<TimelineResponse>(
        `${this.base}/analytics/timeline/${customerId}`,
        { params },
      )
      .pipe(catchError(toPerksError));
  }

  getAnalyticsKpis(window: AnalyticsWindow = '24h'): Observable<KpisResponse> {
    const params = new HttpParams().set('window', window);
    return this.http
      .get<KpisResponse>(`${this.base}/analytics/kpis`, { params })
      .pipe(catchError(toPerksError));
  }

  getRulesLeaderboard(
    opts?: { window?: AnalyticsWindow; limit?: number },
  ): Observable<RulesLeaderboardResponse> {
    let params = new HttpParams();
    if (opts?.window) params = params.set('window', opts.window);
    if (opts?.limit != null) params = params.set('limit', String(opts.limit));
    return this.http
      .get<RulesLeaderboardResponse>(
        `${this.base}/analytics/rules-leaderboard`,
        { params },
      )
      .pipe(catchError(toPerksError));
  }

  getChannelsBreakdown(
    window: AnalyticsWindow = '7d',
  ): Observable<ChannelsResponse> {
    const params = new HttpParams().set('window', window);
    return this.http
      .get<ChannelsResponse>(`${this.base}/analytics/channels`, { params })
      .pipe(catchError(toPerksError));
  }

  getEventsHistogram(opts?: {
    window?: AnalyticsWindow;
    bucket?: 'hour' | 'day';
  }): Observable<HistogramResponse> {
    let params = new HttpParams();
    if (opts?.window) params = params.set('window', opts.window);
    if (opts?.bucket) params = params.set('bucket', opts.bucket);
    return this.http
      .get<HistogramResponse>(
        `${this.base}/analytics/events-histogram`,
        { params },
      )
      .pipe(catchError(toPerksError));
  }
}
