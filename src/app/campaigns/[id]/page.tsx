'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileUpload } from '@/components/file-upload';
import { ContactsTable } from '@/components/contacts-table';
import { ProcessingController } from '@/components/processing-controller';
import type { Campaign, ContactWithAddress, CampaignStatus } from '@/types';

const statusBadge: Record<CampaignStatus, { label: string; variant: 'default' | 'info' | 'success' | 'danger' }> = {
  draft: { label: 'Draft', variant: 'default' },
  processing: { label: 'Processing', variant: 'info' },
  complete: { label: 'Complete', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
};

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<ContactWithAddress[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [campaignRes, contactsRes] = await Promise.all([
      fetch(`/api/campaigns/${id}`),
      fetch(`/api/campaigns/${id}/contacts`),
    ]);

    if (campaignRes.ok) {
      setCampaign(await campaignRes.json());
    }
    if (contactsRes.ok) {
      setContacts(await contactsRes.json());
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleExport() {
    window.open(`/api/campaigns/${id}/export`, '_blank');
  }

  if (loading) {
    return <p className="text-muted text-sm">Loading...</p>;
  }

  if (!campaign) {
    return <p className="text-danger text-sm">Campaign not found.</p>;
  }

  const badge = statusBadge[campaign.status];
  const hasContacts = contacts.length > 0;
  const hasCompletedContacts = contacts.some((c) => c.status === 'complete');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{campaign.name}</h1>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <p className="text-muted text-sm mt-1">
            Created {new Date(campaign.created_at).toLocaleDateString()}
          </p>
        </div>
        {hasCompletedContacts && (
          <Button variant="secondary" onClick={handleExport}>
            Export XLS
          </Button>
        )}
      </div>

      {!hasContacts && (
        <Card>
          <h2 className="text-lg font-medium mb-4">Upload Contacts</h2>
          <FileUpload campaignId={id} onUploadComplete={() => fetchData()} />
        </Card>
      )}

      {hasContacts && (
        <Card>
          <h2 className="text-lg font-medium mb-4">Processing</h2>
          <ProcessingController
            campaignId={id}
            totalContacts={campaign.total_contacts}
            initialProcessedCount={campaign.processed_count}
            campaignStatus={campaign.status}
            onProgress={fetchData}
          />
        </Card>
      )}

      {hasContacts && (
        <Card>
          <h2 className="text-lg font-medium mb-4">
            Contacts ({contacts.length})
          </h2>
          <ContactsTable contacts={contacts} />
        </Card>
      )}
    </div>
  );
}
