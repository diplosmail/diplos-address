'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface FileUploadProps {
  campaignId: string;
  onUploadComplete: (count: number) => void;
}

export function FileUpload({ campaignId, onUploadComplete }: FileUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Upload failed');
        return;
      }

      onUploadComplete(data.count);
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
        dragging ? 'border-primary bg-primary-light' : 'border-border'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleChange}
        className="hidden"
      />

      {uploading ? (
        <p className="text-sm text-muted">Uploading and parsing file...</p>
      ) : (
        <>
          <p className="text-sm text-muted mb-3">
            Drag and drop your XLS or CSV file here, or click to browse.
          </p>
          <p className="text-xs text-muted mb-4">
            Required columns: CRM ID, First Name, Last Name, Company Name, Website URL
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            Browse Files
          </Button>
        </>
      )}

      {error && (
        <div className="mt-4 text-left bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-danger font-medium mb-1">Upload Error</p>
          <p className="text-sm text-danger whitespace-pre-line">{error}</p>
        </div>
      )}
    </div>
  );
}
