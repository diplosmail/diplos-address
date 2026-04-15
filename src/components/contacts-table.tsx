'use client';

import { Badge } from '@/components/ui/badge';
import type { ContactWithAddress, ContactStatus, AddressSource } from '@/types';

const statusConfig: Record<ContactStatus, { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'Pending', variant: 'default' },
  scraping: { label: 'Scraping', variant: 'info' },
  scraped: { label: 'Scraped', variant: 'warning' },
  verifying: { label: 'Verifying', variant: 'info' },
  complete: { label: 'Complete', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
};

const sourceLabels: Record<AddressSource, string> = {
  website: 'Website',
  google_maps: 'Google Maps',
  bbb: 'BBB',
  yelp: 'Yelp',
  public_directory: 'Public Directory',
  llm_knowledge: 'LLM Knowledge',
  other: 'Other',
};

interface ContactsTableProps {
  contacts: ContactWithAddress[];
}

export function ContactsTable({ contacts }: ContactsTableProps) {
  if (contacts.length === 0) {
    return <p className="text-sm text-muted text-center py-8">No contacts yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="pb-3 pr-3 font-medium text-muted">CRM ID</th>
            <th className="pb-3 pr-3 font-medium text-muted">Name</th>
            <th className="pb-3 pr-3 font-medium text-muted">Company</th>
            <th className="pb-3 pr-3 font-medium text-muted">URL</th>
            <th className="pb-3 pr-3 font-medium text-muted">Street Address</th>
            <th className="pb-3 pr-3 font-medium text-muted">Street Address 2</th>
            <th className="pb-3 pr-3 font-medium text-muted">City</th>
            <th className="pb-3 pr-3 font-medium text-muted">State/Region</th>
            <th className="pb-3 pr-3 font-medium text-muted">Postal Code</th>
            <th className="pb-3 pr-3 font-medium text-muted">Country</th>
            <th className="pb-3 pr-3 font-medium text-muted">Source</th>
            <th className="pb-3 pr-3 font-medium text-muted">Verified</th>
            <th className="pb-3 pr-3 font-medium text-muted">Deliverable</th>
            <th className="pb-3 font-medium text-muted">Status</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => {
            const address = contact.addresses?.[0];
            const status = statusConfig[contact.status];
            const sourceLabel = address ? (sourceLabels[address.source as AddressSource] || address.source) : '';
            return (
              <tr key={contact.id} className="border-b border-border/50">
                <td className="py-3 pr-3 text-muted font-mono text-xs">
                  {contact.crm_id}
                </td>
                <td className="py-3 pr-3">
                  {contact.first_name} {contact.last_name}
                </td>
                <td className="py-3 pr-3">{contact.company_name}</td>
                <td className="py-3 pr-3">
                  <span className="text-muted truncate block max-w-[160px]" title={contact.company_url}>
                    {contact.company_url.replace(/^https?:\/\//, '')}
                  </span>
                </td>
                <td className="py-3 pr-3">{address?.street_address || <span className="text-muted">--</span>}</td>
                <td className="py-3 pr-3">{address?.street_address_2 || <span className="text-muted">--</span>}</td>
                <td className="py-3 pr-3">{address?.city || <span className="text-muted">--</span>}</td>
                <td className="py-3 pr-3">{address?.state_region || <span className="text-muted">--</span>}</td>
                <td className="py-3 pr-3">{address?.postal_code || <span className="text-muted">--</span>}</td>
                <td className="py-3 pr-3">{address?.country_region || <span className="text-muted">--</span>}</td>
                <td className="py-3 pr-3">
                  {address ? (
                    <Badge variant="info">{sourceLabel}</Badge>
                  ) : (
                    <span className="text-muted">--</span>
                  )}
                </td>
                <td className="py-3 pr-3">
                  {address?.is_verified ? (
                    <Badge variant="success">Yes</Badge>
                  ) : address ? (
                    <Badge variant="danger">No</Badge>
                  ) : (
                    <span className="text-muted">--</span>
                  )}
                </td>
                <td className="py-3 pr-3">
                  {address?.is_verified ? (
                    address.is_deliverable ? (
                      <Badge variant="success">Yes</Badge>
                    ) : (
                      <Badge variant="danger">No</Badge>
                    )
                  ) : (
                    <span className="text-muted">--</span>
                  )}
                </td>
                <td className="py-3">
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {contact.error_message && (
                    <p className="text-xs text-danger mt-1 whitespace-normal max-w-[180px]" title={contact.error_message}>
                      {contact.error_message.slice(0, 80)}
                    </p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
