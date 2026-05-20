export type PaymentMethod = 'nequi' | 'daviplata' | 'bank_transfer' | 'qr' | 'cash';
export type PaymentStatus = 'pending' | 'confirmed' | 'rejected';

export interface Payment {
  id: number;
  ticket_id: number;
  customer_id: number;
  seller_id: number | null;
  method: PaymentMethod;
  amount: number;
  reference: string | null;
  proof_url: string | null;
  notes: string | null;
  status: PaymentStatus;
  confirmed_by: number | null;
  confirmed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface PaymentListItem {
  id: number;
  ticket_id: number;
  ticket_label: string;
  ticket_code: string;
  raffle_name: string;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  seller_id: number | null;
  seller_name: string | null;
  method: PaymentMethod;
  amount: number;
  reference: string | null;
  proof_url: string | null;
  notes: string | null;
  status: PaymentStatus;
  rejection_reason: string | null;
  created_at: string;
  confirmed_at: string | null;
}

export interface AuditActor {
  id: number;
  full_name: string;
  email: string;
}

export interface AuditLog {
  id: number;
  actor_id: number | null;
  actor: AuditActor | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  description: string | null;
  metadata_json: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AuditPage {
  items: AuditLog[];
  total: number;
  page: number;
  page_size: number;
}
