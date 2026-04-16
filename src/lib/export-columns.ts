// Default dynamic columns that map to contact/address fields
// These are always present and cannot be deleted
export const DEFAULT_COLUMNS = [
  { column_key: 'crm_id', column_name: 'CRM ID' },
  { column_key: 'first_name', column_name: 'First Name' },
  { column_key: 'last_name', column_name: 'Last Name' },
  { column_key: 'company_name', column_name: 'Company Name' },
  { column_key: 'street_address', column_name: 'Street Address' },
  { column_key: 'street_address_2', column_name: 'Street Address 2' },
  { column_key: 'city', column_name: 'City' },
  { column_key: 'state_region', column_name: 'State/Region' },
  { column_key: 'postal_code', column_name: 'Postal Code' },
  { column_key: 'country_region', column_name: 'Country/Region' },
  { column_key: 'source', column_name: 'Address Source' },
  { column_key: 'is_verified', column_name: 'Verified' },
  { column_key: 'is_deliverable', column_name: 'Deliverable' },
];

// Map a column_key to the actual value from contact + address data
export function getColumnValue(
  key: string,
  contact: Record<string, unknown>,
  address: Record<string, unknown> | null
): string {
  switch (key) {
    case 'crm_id': return String(contact.crm_id ?? '');
    case 'first_name': return String(contact.first_name ?? '');
    case 'last_name': return String(contact.last_name ?? '');
    case 'company_name': return String(contact.company_name ?? '');
    case 'street_address': return String(address?.street_address ?? '');
    case 'street_address_2': return address?.street_address_2 ? String(address.street_address_2) : '--';
    case 'city': return String(address?.city ?? '');
    case 'state_region': return String(address?.state_region ?? '');
    case 'postal_code': return String(address?.postal_code ?? '');
    case 'country_region': return String(address?.country_region ?? '');
    case 'source': return String(address?.source ?? '');
    case 'is_verified': return address?.is_verified ? 'Yes' : 'No';
    case 'is_deliverable': return address?.is_deliverable ? 'Yes' : 'No';
    default: return '';
  }
}
