import { getSupabaseServerClient } from '@/lib/supabase/server';
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

  // Fetch export settings (hard-coded columns)
  const { data: settings } = await supabase
    .from('export_settings')
    .select('*')
    .order('column_order', { ascending: true });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Addresses');

  // Build header row: hard-coded columns + dynamic columns
  const hardCodedColumns = (settings || []).map((s) => s.column_name);
  const dynamicColumns = [
    'First Name',
    'Last Name',
    'Company Name',
    'Street Address',
    'Street Address 2',
    'City',
    'State/Region',
    'Postal Code',
    'Country/Region',
    'Address Source',
    'Verified',
    'Deliverable',
  ];

  const allColumns = [...hardCodedColumns, ...dynamicColumns];

  // Add header row with styling
  const headerRow = worksheet.addRow(allColumns);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });

  // Add data rows
  for (const contact of contacts || []) {
    const address = contact.addresses?.[0];
    const hardCodedValues = (settings || []).map((s) => s.default_value);
    const dynamicValues = [
      contact.first_name,
      contact.last_name,
      contact.company_name,
      address?.street_address || '',
      address?.street_address_2 || '--',
      address?.city || '',
      address?.state_region || '',
      address?.postal_code || '',
      address?.country_region || '',
      address?.source || '',
      address?.is_verified ? 'Yes' : 'No',
      address?.is_deliverable ? 'Yes' : 'No',
    ];

    worksheet.addRow([...hardCodedValues, ...dynamicValues]);
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

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();

  const filename = `${campaign.name.replace(/[^a-zA-Z0-9]/g, '_')}_export.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
