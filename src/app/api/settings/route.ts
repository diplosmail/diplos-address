import { getSupabaseServerClient } from '@/lib/supabase/server';
import { DEFAULT_COLUMNS } from '@/lib/export-columns';

// Ensure default columns exist in the DB and remove stale ones
async function seedDefaults(supabase: ReturnType<typeof getSupabaseServerClient>) {
  const { data: existing } = await supabase
    .from('export_settings')
    .select('id, column_key')
    .eq('column_type', 'dynamic');

  const existingKeys = new Set((existing || []).map((e) => e.column_key));
  const validKeys = new Set(DEFAULT_COLUMNS.map((c) => c.column_key));

  // Remove dynamic columns that are no longer in the default list
  const staleIds = (existing || [])
    .filter((e) => !validKeys.has(e.column_key))
    .map((e) => e.id);

  if (staleIds.length > 0) {
    await supabase.from('export_settings').delete().in('id', staleIds);
  }

  // Find max order
  const { data: maxRow } = await supabase
    .from('export_settings')
    .select('column_order')
    .order('column_order', { ascending: false })
    .limit(1);

  let nextOrder = maxRow && maxRow.length > 0 ? maxRow[0].column_order + 1 : 0;

  // Insert missing default columns
  const toInsert = DEFAULT_COLUMNS
    .filter((col) => !existingKeys.has(col.column_key))
    .map((col) => ({
      column_name: col.column_name,
      column_key: col.column_key,
      column_type: 'dynamic',
      default_value: '',
      column_order: nextOrder++,
    }));

  if (toInsert.length > 0) {
    await supabase.from('export_settings').insert(toInsert);
  }
}

export async function GET() {
  const supabase = getSupabaseServerClient();

  await seedDefaults(supabase);

  const { data, error } = await supabase
    .from('export_settings')
    .select('*')
    .order('column_order', { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  const body = await request.json();

  // Handle batch reorder
  if (body.reorder && Array.isArray(body.reorder)) {
    for (const item of body.reorder) {
      await supabase
        .from('export_settings')
        .update({ column_order: item.column_order })
        .eq('id', item.id);
    }
    return Response.json({ success: true });
  }

  if (!body.column_name?.trim()) {
    return Response.json({ error: 'Column name is required' }, { status: 400 });
  }

  // Get max order
  const { data: existing } = await supabase
    .from('export_settings')
    .select('column_order')
    .order('column_order', { ascending: false })
    .limit(1);

  const nextOrder = existing && existing.length > 0 ? existing[0].column_order + 1 : 0;

  const { data, error } = await supabase
    .from('export_settings')
    .insert({
      column_name: body.column_name.trim(),
      default_value: body.default_value?.trim() || '',
      column_order: nextOrder,
      column_type: 'custom',
      column_key: null,
    })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data, { status: 201 });
}

export async function PUT(request: Request) {
  const supabase = getSupabaseServerClient();
  const body = await request.json();

  if (!body.id) {
    return Response.json({ error: 'Setting ID is required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.column_name !== undefined) updates.column_name = body.column_name.trim();
  if (body.default_value !== undefined) updates.default_value = body.default_value.trim();
  if (body.column_order !== undefined) updates.column_order = body.column_order;

  const { data, error } = await supabase
    .from('export_settings')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

export async function DELETE(request: Request) {
  const supabase = getSupabaseServerClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return Response.json({ error: 'Setting ID is required' }, { status: 400 });
  }

  // Don't allow deleting dynamic columns
  const { data: setting } = await supabase
    .from('export_settings')
    .select('column_type')
    .eq('id', id)
    .single();

  if (setting?.column_type === 'dynamic') {
    return Response.json({ error: 'Cannot delete default columns' }, { status: 400 });
  }

  const { error } = await supabase
    .from('export_settings')
    .delete()
    .eq('id', id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
