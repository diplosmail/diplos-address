import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getColumnValue } from '@/lib/export-columns';
import ExcelJS from 'exceljs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  // Fetch campaign
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('name')
    .eq('id', id)
    .single();

  if (!campaign) {
    return Response.json({ error: 'Campaign not found' }, { status: 404 });
  }

  // Fetch completed contacts with addresses
  const { data: contacts } = await supabase
    .from('contacts')
    .select('*, addresses(*)')
    .eq('campaign_id', id)
    .eq('status', 'complete')
    .order('created_at', { ascending: true });

  // Fetch export settings in order
  const { data: settings } = await supabase
    .from('export_settings')
    .select('*')
    .order('column_order', { ascending: true });

  const columns = settings || [];

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Addresses');

  // Header row from settings order
  const headerRow = worksheet.addRow(columns.map((c) => c.column_name));
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });

  // Data rows
  for (const contact of contacts || []) {
    const address = contact.addresses?.[0] || null;
    const values = columns.map((col) => {
      if (col.column_type === 'dynamic' && col.column_key) {
        return getColumnValue(col.column_key, contact, address);
      }
      // Custom column — use default value
      return col.default_value || '';
    });
    worksheet.addRow(values);
  }

  // Auto-fit column widths
  worksheet.columns.forEach((column) => {
    let maxLength = 10;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const len = String(cell.value || '').length;
      if (len > maxLength) maxLength = len;
    });
    column.width = Math.min(maxLength + 2, 40);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${campaign.name.replace(/[^a-zA-Z0-9]/g, '_')}_export.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
