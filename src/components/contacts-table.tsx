'use client';

import { Badge } from '@/components/ui/badge';
import type { ContactWithAddress, ContactStatus } from '@/types';

const statusConfig: Record<ContactStatus, { label: string; variant: 'default' | 'info' | 'warning' | 'success' | 'danger' }> = {
  pending: { label: 'Pending', variant: 'default' },
  scraping: { label: 'Scraping', variant: 'info' },
  verifying: { label: 'Verifying', variant: 'warning' },
  complete: { label: 'Complete', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
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
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="pb-3 font-medium text-muted">CRM ID</th>
            <th className="pb-3 font-medium text-muted">Name</th>
            <th className="pb-3 font-medium text-muted">Company</th>
            <th className="pb-3 font-medium text-muted">URL</th>
            <th className="pb-3 font-medium text-muted">Address</th>
            <th className="pb-3 font-medium text-muted">Source</th>
            <th className="pb-3 font-medium text-muted">Deliverable</th>
            <th className="pb-3 font-medium text-muted">Status</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((contact) => {
            const address = contact.addresses?.[0];
            const status = statusConfig[contact.status];
            return (
              <tr key={contact.id} className="border-b border-border/50">
                <td className="py-3 pr-4 text-muted font-mono text-xs">
                  {contact.crm_id}
                </td>
                <td className="py-3 pr-4">
                  {contact.first_name} {contact.last_name}
                </td>
                <td className="py-3 pr-4">{contact.company_name}</td>
                <td className="py-3 pr-4">
                  <span className="text-muted truncate block max-w-[180px]" title={contact.company_url}>
                    {contact.company_url.replace(/^https?:\/\//, '')}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  {address ? (
                    <span title={`${address.street_address}, ${address.city}, ${address.state_region} ${address.postal_code}`}>
                      {address.street_address}, {address.city}, {address.state_region} {address.postal_code}
                    </span>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  {address ? (
                    <Badge variant="info">{address.source}</Badge>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
                <td className="py-3 pr-4">
                  {address?.is_verified ? (
                    address.is_deliverable ? (
                      <Badge variant="success">Yes</Badge>
                    ) : (
                      <Badge variant="danger">No</Badge>
                    )
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
                <td className="py-3">
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {contact.error_message && (
                    <p className="text-xs text-danger mt-1" title={contact.error_message}>
                      {contact.error_message.slice(0, 50)}
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
