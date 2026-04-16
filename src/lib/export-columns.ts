// Default dynamic columns that map to contact/address fields
// These are always present and cannot be deleted
export const DEFAULT_COLUMNS: { column_key: string; column_name: string }[] = [
  { column_key: 'recipient_contact', column_name: 'Recipient Contact' },
  { column_key: 'recipient_company', column_name: 'Recipient Company' },
  { column_key: 'recipient_address_1', column_name: 'Recipient Address 1' },
  { column_key: 'recipient_address_2', column_name: 'Recipient Address 2' },
  { column_key: 'recipient_city', column_name: 'Recipient City' },
  { column_key: 'recipient_state', column_name: 'Recipient State/Province' },
  { column_key: 'recipient_zip', column_name: 'Recipient Zip Code' },
  { column_key: 'recipient_country', column_name: 'Recipient Country' },
  { column_key: 'crm_id', column_name: 'Ref 1 (Reference)' },
];

// Map a column_key to the actual value from contact + address data
export function getColumnValue(
  key: string,
  contact: Record<string, unknown>,
  address: Record<string, unknown> | null
): string {
  switch (key) {
    case 'recipient_contact': {
      const first = String(contact.first_name ?? '').trim();
      const last = String(contact.last_name ?? '').trim();
      return [first, last].filter(Boolean).join(' ');
    }
    case 'recipient_company':
      return String(contact.company_name ?? '');
    case 'recipient_address_1':
      return String(address?.street_address ?? '');
    case 'recipient_address_2':
      return address?.street_address_2 ? String(address.street_address_2) : '';
    case 'recipient_city':
      return String(address?.city ?? '');
    case 'recipient_state':
      return String(address?.state_region ?? '');
    case 'recipient_zip':
      return String(address?.postal_code ?? '');
    case 'recipient_country':
      return String(address?.country_region ?? '');
    case 'crm_id':
      return String(contact.crm_id ?? '');
    default:
      return '';
  }
}
