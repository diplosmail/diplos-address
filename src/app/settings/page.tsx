'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ExportSetting } from '@/types';

export default function SettingsPage() {
  const [columns, setColumns] = useState<ExportSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [newColumn, setNewColumn] = useState('');
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchColumns();
  }, []);

  async function fetchColumns() {
    const res = await fetch('/api/settings');
    const data = await res.json();
    setColumns(data);
    setLoading(false);
  }

  async function addColumn(e: React.FormEvent) {
    e.preventDefault();
    if (!newColumn.trim()) return;

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        column_name: newColumn,
        default_value: newValue,
      }),
    });

    if (res.ok) {
      setNewColumn('');
      setNewValue('');
      fetchColumns();
    }
  }

  async function deleteColumn(id: string) {
    await fetch(`/api/settings?id=${id}`, { method: 'DELETE' });
    fetchColumns();
  }

  async function updateColumn(id: string, field: 'column_name' | 'default_value', value: string) {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [field]: value }),
    });
  }

  async function moveColumn(index: number, direction: 'up' | 'down') {
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= columns.length) return;

    const updated = [...columns];
    [updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]];

    // Update local state immediately for responsiveness
    setColumns(updated);

    // Save new order to DB
    setSaving(true);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reorder: updated.map((col, i) => ({ id: col.id, column_order: i })),
      }),
    });
    setSaving(false);
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Export Settings</h1>
        <p className="text-muted text-sm mt-1">
          Configure the column order and add custom columns for your exported XLS files.
          Use the arrows to reorder. Custom columns will have the same default value for every row.
        </p>
      </div>

      <Card className="mb-6">
        <h2 className="text-lg font-medium mb-4">Add Custom Column</h2>
        <form onSubmit={addColumn} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Column Name</label>
            <input
              type="text"
              value={newColumn}
              onChange={(e) => setNewColumn(e.target.value)}
              placeholder="e.g. Gift Type"
              className="w-full h-10 px-3 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">Default Value</label>
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="e.g. Welcome Kit"
              className="w-full h-10 px-3 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <Button type="submit">Add</Button>
        </form>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Export Column Order</h2>
          {saving && <span className="text-xs text-muted">Saving...</span>}
        </div>
        {loading ? (
          <p className="text-sm text-muted">Loading...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-3 pr-3 font-medium text-muted w-16">#</th>
                <th className="pb-3 pr-3 font-medium text-muted w-20">Order</th>
                <th className="pb-3 pr-3 font-medium text-muted">Column Name</th>
                <th className="pb-3 pr-3 font-medium text-muted">Type</th>
                <th className="pb-3 pr-3 font-medium text-muted">Default Value</th>
                <th className="pb-3 font-medium text-muted w-24"></th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col, i) => {
                const isDynamic = col.column_type === 'dynamic';
                return (
                  <tr key={col.id} className="border-b border-border/50">
                    <td className="py-3 pr-3 text-muted">{i + 1}</td>
                    <td className="py-3 pr-3">
                      <div className="flex gap-1">
                        <button
                          className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                          onClick={() => moveColumn(i, 'up')}
                          disabled={i === 0}
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                          onClick={() => moveColumn(i, 'down')}
                          disabled={i === columns.length - 1}
                          title="Move down"
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      {isDynamic ? (
                        <span className="font-medium">{col.column_name}</span>
                      ) : (
                        <input
                          type="text"
                          defaultValue={col.column_name}
                          onBlur={(e) => updateColumn(col.id, 'column_name', e.target.value)}
                          className="w-full h-8 px-2 rounded border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <Badge variant={isDynamic ? 'info' : 'default'}>
                        {isDynamic ? 'Data' : 'Custom'}
                      </Badge>
                    </td>
                    <td className="py-3 pr-3">
                      {isDynamic ? (
                        <span className="text-muted text-xs">Auto-populated from data</span>
                      ) : (
                        <input
                          type="text"
                          defaultValue={col.default_value}
                          onBlur={(e) => updateColumn(col.id, 'default_value', e.target.value)}
                          className="w-full h-8 px-2 rounded border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      )}
                    </td>
                    <td className="py-3">
                      {!isDynamic && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteColumn(col.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
