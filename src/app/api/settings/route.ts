import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = getSupabaseServerClient();

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

  const { error } = await supabase
    .from('export_settings')
    .delete()
    .eq('id', id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
