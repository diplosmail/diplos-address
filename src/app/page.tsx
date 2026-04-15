'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Campaign, CampaignStatus } from '@/types';

const statusBadge: Record<CampaignStatus, { label: string; variant: 'default' | 'info' | 'success' | 'danger' }> = {
  draft: { label: 'Draft', variant: 'default' },
  processing: { label: 'Processing', variant: 'info' },
  complete: { label: 'Complete', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
};

export default function DashboardPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    fetchCampaigns();
  }, []);

  async function fetchCampaigns() {
    const res = await fetch('/api/campaigns');
    const data = await res.json();
    setCampaigns(data);
    setLoading(false);
  }

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;

    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    });

    if (res.ok) {
      const campaign = await res.json();
      setNewName('');
      setCreating(false);
      router.push(`/campaigns/${campaign.id}`);
    }
  }

  async function deleteCampaign(id: string) {
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' });
    setCampaigns(campaigns.filter((c) => c.id !== id));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold">Campaigns</h1>
          <p className="text-muted text-sm mt-1">
            Upload contacts, scrape addresses, and verify deliverability.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>New Campaign</Button>
      </div>

      {creating && (
        <Card className="mb-6">
          <form onSubmit={createCampaign} className="flex gap-3 items-end">
            <div className="flex-1">
              <label htmlFor="name" className="block text-sm font-medium mb-1">
                Campaign Name
              </label>
              <input
                id="name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Q2 Outreach"
                className="w-full h-10 px-3 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                autoFocus
              />
            </div>
            <Button type="submit">Create</Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCreating(false);
                setNewName('');
              }}
            >
              Cancel
            </Button>
          </form>
        </Card>
      )}

      {loading ? (
        <p className="text-muted text-sm">Loading campaigns...</p>
      ) : campaigns.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-muted text-sm">No campaigns yet. Create your first one to get started.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const badge = statusBadge[campaign.status];
            return (
              <Card key={campaign.id} className="flex items-center justify-between py-4">
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => router.push(`/campaigns/${campaign.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{campaign.name}</span>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  <p className="text-muted text-sm mt-1">
                    {campaign.total_contacts} contacts
                    {campaign.processed_count > 0 &&
                      ` \u00b7 ${campaign.processed_count} processed`}
                    {' \u00b7 '}
                    {new Date(campaign.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCampaign(campaign.id);
                  }}
                >
                  Delete
                </Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
