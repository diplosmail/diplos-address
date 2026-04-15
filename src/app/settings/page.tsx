'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { ExportSetting } from '@/types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<ExportSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [newColumn, setNewColumn] = useState('');
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    const res = await fetch('/api/settings');
    const data = await res.json();
    setSettings(data);
    setLoading(false);
  }

  async function addSetting(e: React.FormEvent) {
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
      fetchSettings();
    }
  }

  async function deleteSetting(id: string) {
    await fetch(`/api/settings?id=${id}`, { method: 'DELETE' });
    setSettings(settings.filter((s) => s.id !== id));
  }

  async function updateSetting(id: string, field: 'column_name' | 'default_value', value: string) {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [field]: value }),
    });
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Export Settings</h1>
        <p className="text-muted text-sm mt-1">
          Configure hard-coded columns that appear in every exported XLS file.
          These columns will have the same value for every row.
        </p>
      </div>

      <Card className="mb-6">
        <h2 className="text-lg font-medium mb-4">Add Column</h2>
        <form onSubmit={addSetting} className="flex gap-3 items-end">
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
        <h2 className="text-lg font-medium mb-4">Current Columns</h2>
        {loading ? (
          <p className="text-sm text-muted">Loading...</p>
        ) : settings.length === 0 ? (
          <p className="text-sm text-muted">No hard-coded columns configured yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-3 font-medium text-muted">Order</th>
                <th className="pb-3 font-medium text-muted">Column Name</th>
                <th className="pb-3 font-medium text-muted">Default Value</th>
                <th className="pb-3 font-medium text-muted"></th>
              </tr>
            </thead>
            <tbody>
              {settings.map((setting, i) => (
                <tr key={setting.id} className="border-b border-border/50">
                  <td className="py-3 pr-4 text-muted">{i + 1}</td>
                  <td className="py-3 pr-4">
                    <input
                      type="text"
                      defaultValue={setting.column_name}
                      onBlur={(e) => updateSetting(setting.id, 'column_name', e.target.value)}
                      className="w-full h-8 px-2 rounded border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <input
                      type="text"
                      defaultValue={setting.default_value}
                      onBlur={(e) => updateSetting(setting.id, 'default_value', e.target.value)}
                      className="w-full h-8 px-2 rounded border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </td>
                  <td className="py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteSetting(setting.id)}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
