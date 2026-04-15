'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface ProcessingControllerProps {
  campaignId: string;
  totalContacts: number;
  initialProcessedCount: number;
  campaignStatus: string;
  onProgress: () => void;
}

export function ProcessingController({
  campaignId,
  totalContacts,
  initialProcessedCount,
  campaignStatus,
  onProgress,
}: ProcessingControllerProps) {
  const [processing, setProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(initialProcessedCount);
  const [currentContact, setCurrentContact] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    setProcessedCount(initialProcessedCount);
  }, [initialProcessedCount]);

  const processNext = useCallback(async () => {
    if (abortRef.current) return false;

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/process`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Processing failed');
        return false;
      }

      if (data.done) {
        return false;
      }

      setProcessedCount(data.processedCount);
      setCurrentContact(data.contactName || null);
      onProgress();
      return true;
    } catch {
      setError('Processing interrupted. You can resume anytime.');
      return false;
    }
  }, [campaignId, onProgress]);

  async function startProcessing() {
    setProcessing(true);
    setError(null);
    abortRef.current = false;

    let hasMore = true;
    while (hasMore && !abortRef.current) {
      hasMore = await processNext();
    }

    setProcessing(false);
    setCurrentContact(null);
    onProgress();
  }

  function stopProcessing() {
    abortRef.current = true;
  }

  const isComplete = campaignStatus === 'complete' || processedCount >= totalContacts;

  if (totalContacts === 0) return null;

  return (
    <div className="space-y-4">
      <Progress value={processedCount} max={totalContacts} />

      {currentContact && processing && (
        <p className="text-sm text-muted">
          Processing: {currentContact}
        </p>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3">
        {!isComplete && !processing && (
          <Button onClick={startProcessing}>
            {processedCount > 0 ? 'Resume Processing' : 'Start Processing'}
          </Button>
        )}
        {processing && (
          <Button variant="secondary" onClick={stopProcessing}>
            Pause
          </Button>
        )}
        {isComplete && (
          <p className="text-sm text-success font-medium">
            All contacts processed.
          </p>
        )}
      </div>
    </div>
  );
}
