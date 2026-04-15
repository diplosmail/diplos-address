'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface ProcessingControllerProps {
  campaignId: string;
  endpoint: 'scrape' | 'verify';
  label: string;
  buttonLabel: string;
  resumeLabel: string;
  totalCount: number;
  initialCompletedCount: number;
  countField: string;
  disabled?: boolean;
  disabledMessage?: string;
  onProgress: () => void;
}

export function ProcessingController({
  campaignId,
  endpoint,
  label,
  buttonLabel,
  resumeLabel,
  totalCount,
  initialCompletedCount,
  countField,
  disabled = false,
  disabledMessage,
  onProgress,
}: ProcessingControllerProps) {
  const [processing, setProcessing] = useState(false);
  const [completedCount, setCompletedCount] = useState(initialCompletedCount);
  const [currentContact, setCurrentContact] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    setCompletedCount(initialCompletedCount);
  }, [initialCompletedCount]);

  const processNext = useCallback(async () => {
    if (abortRef.current) return false;

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/${endpoint}`, {
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

      setCompletedCount(data[countField] ?? completedCount + 1);
      setCurrentContact(data.contactName || null);
      onProgress();
      return true;
    } catch {
      setError('Processing interrupted. You can resume anytime.');
      return false;
    }
  }, [campaignId, endpoint, countField, completedCount, onProgress]);

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

  const isComplete = completedCount >= totalCount;

  if (totalCount === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-foreground">{label}</h3>
      <Progress value={completedCount} max={totalCount} />

      {currentContact && processing && (
        <p className="text-sm text-muted">
          Processing: {currentContact}
        </p>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-3 items-center">
        {disabled && !isComplete && (
          <p className="text-sm text-muted">{disabledMessage}</p>
        )}
        {!disabled && !isComplete && !processing && (
          <Button onClick={startProcessing} size="sm">
            {completedCount > 0 ? resumeLabel : buttonLabel}
          </Button>
        )}
        {processing && (
          <Button variant="secondary" size="sm" onClick={stopProcessing}>
            Pause
          </Button>
        )}
        {isComplete && (
          <p className="text-sm text-success font-medium">Complete</p>
        )}
      </div>
    </div>
  );
}
