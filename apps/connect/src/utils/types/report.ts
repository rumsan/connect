export interface TransportStatsRaw {
  transport_id: string;
  transport_name: string;
  transport_type: string;
  total_broadcasts: number;
  success_count: number;
  failed_count: number;
  pending_count: number;
  average_attempts: number;
  max_attempts: number;
  total_recipients: number;
}


