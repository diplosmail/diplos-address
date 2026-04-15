export type CampaignStatus = 'draft' | 'processing' | 'complete' | 'failed';
export type ContactStatus = 'pending' | 'scraping' | 'verifying' | 'complete' | 'failed';
export type AddressSource = 'website' | 'google_maps' | 'other';

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  total_contacts: number;
  processed_count: number;
  created_at: string;
}

export interface Contact {
  id: string;
  campaign_id: string;
  first_name: string;
  last_name: string;
  company_name: string;
  company_url: string;
  status: ContactStatus;
  error_message: string | null;
  created_at: string;
}

export interface Address {
  id: string;
  contact_id: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  source: AddressSource;
  source_url: string | null;
  is_verified: boolean;
  is_deliverable: boolean;
  melissa_result: Record<string, unknown> | null;
  created_at: string;
}

export interface ExportSetting {
  id: string;
  column_name: string;
  default_value: string;
  column_order: number;
  created_at: string;
}

export interface ContactWithAddress extends Contact {
  addresses: Address[];
}
