import { SubscriptionStatus } from './user.model';

export interface TenantUsage {
  raffles_used: number;
  raffles_max: number;
  sellers_count: number;
  admins_count: number;
}

export interface Tenant {
  id: number;
  name: string;
  slug: string;
  start_date: string;
  end_date: string;
  max_raffles: number;
  is_active: boolean;
  billing_email?: string | null;
  billing_phone?: string | null;
  notes?: string | null;
  usage: TenantUsage;
  subscription_status: SubscriptionStatus;
}

export interface TenantCreatePayload {
  name: string;
  slug?: string;
  start_date: string;
  end_date: string;
  max_raffles: number;
  billing_email?: string;
  billing_phone?: string;
  notes?: string;
  admin_full_name: string;
  admin_email: string;
  admin_password: string;
  admin_phone?: string;
}

export interface TenantUpdatePayload {
  name?: string;
  start_date?: string;
  end_date?: string;
  max_raffles?: number;
  is_active?: boolean;
  billing_email?: string | null;
  billing_phone?: string | null;
  notes?: string | null;
}
