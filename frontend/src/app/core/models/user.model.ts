export type UserRole = 'super_admin' | 'admin' | 'seller';

export type SubscriptionStatus =
  | 'active'
  | 'grace_period'
  | 'expired'
  | 'not_started'
  | 'suspended';

export interface UserTenantInfo {
  id: number;
  name: string;
  slug: string;
  end_date: string; // ISO date
  max_raffles: number;
  subscription_status: SubscriptionStatus;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  tenant_id?: number | null;
  tenant?: UserTenantInfo | null;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}
