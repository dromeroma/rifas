export interface TicketStatusCount {
  status: string;
  count: number;
}

export interface NextDraw {
  prize_name: string;
  draw_date: string;
  days_remaining: number;
  seconds_remaining: number;
}

export interface RaffleStats {
  raffle_id: number;
  total_tickets: number;
  numbers_generated: boolean;
  by_status: TicketStatusCount[];
  sold: number;
  reserved: number;
  available: number;
  revenue_collected: number;
  revenue_potential: number;
  can_run_draw: boolean;
  min_threshold: number;
  threshold_progress_pct: number;
  next_draw: NextDraw | null;
  final_draw_date: string;
  days_to_final_draw: number;
}

export interface SellerUser {
  id: number;
  email: string;
  full_name: string;
  role: 'super_admin' | 'admin' | 'seller';
  phone?: string | null;
  is_active: boolean;
  default_commission?: number | null;
}

export interface SellerSummary {
  id: number;
  email: string;
  full_name: string;
  phone?: string | null;
  is_active: boolean;
  default_commission?: number | null;
  /** Total de boletas con seller_id == este vendedor (todos los estados). */
  assigned_tickets: number;
  paid_tickets: number;
  commission_total: number;
  commission_paid: number;
  commission_pending: number;
}

export interface Customer {
  id: number;
  full_name: string;
  document?: string | null;
  phone: string;
  email?: string | null;
  city?: string | null;
}

export interface SellerAssignment {
  id: number;
  raffle_id: number;
  seller_id: number;
  from_ticket: number;
  to_ticket: number;
  status: string;
  note?: string | null;
}
