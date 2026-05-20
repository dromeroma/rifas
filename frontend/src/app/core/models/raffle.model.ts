export type RaffleStatus = 'draft' | 'active' | 'locked' | 'finished' | 'cancelled';

export interface CommissionTier {
  from_count: number;
  to_count: number | null;
  amount_per_ticket: number;
}

export interface SellerTierStatus {
  raffle_id: number;
  seller_id: number;
  paid_count: number;
  current_tier: CommissionTier | null;
  next_tier: CommissionTier | null;
  tickets_to_next_tier: number | null;
  current_amount_per_ticket: number;
  earned_total: number;
  uses_tiers: boolean;
}

export interface Prize {
  id?: number;
  raffle_id?: number;
  position: number;
  name: string;
  description?: string | null;
  estimated_value?: number | null;
  draw_date: string;
  image_url?: string | null;
  winning_number?: string | null;
}

export interface Raffle {
  id: number;
  name: string;
  description?: string | null;
  total_tickets: number;
  numbers_per_ticket: number;
  number_min: number;
  number_max: number;
  number_digits: number;
  ticket_price: number;
  seller_commission: number;
  commission_tiers?: CommissionTier[] | null;
  min_paid_threshold: number;
  final_draw_date: string;
  status: RaffleStatus;
  numbers_generated: boolean;
  numbers_generated_at?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  lottery_name?: string | null;
  responsible_name?: string | null;
  responsible_phone?: string | null;
  responsible_email?: string | null;
  terms?: string | null;
  prizes: Prize[];
}

export interface RaffleUpdatePayload {
  name?: string;
  description?: string | null;
  final_draw_date?: string;
  min_paid_threshold?: number;
  logo_url?: string | null;
  primary_color?: string | null;
  lottery_name?: string | null;
  responsible_name?: string | null;
  responsible_phone?: string | null;
  responsible_email?: string | null;
  terms?: string | null;
}

export type TicketStatus =
  | 'available'
  | 'reserved'
  | 'pending_payment'
  | 'paid'
  | 'expired'
  | 'winning';

export interface TicketNumber {
  number: string;
  position: number;
}

export interface TicketCustomer {
  id: number;
  full_name: string;
  phone: string;
  document?: string | null;
  email?: string | null;
  city?: string | null;
}

export interface TicketSeller {
  id: number;
  full_name: string;
  email: string;
}

export interface Ticket {
  id: number;
  raffle_id: number;
  number_label: string;
  code: string;
  status: TicketStatus;
  seller_id?: number | null;
  customer_id?: number | null;
  numbers: TicketNumber[];
  customer?: TicketCustomer | null;
  seller?: TicketSeller | null;
  reservation_expires_at?: string | null;
}
