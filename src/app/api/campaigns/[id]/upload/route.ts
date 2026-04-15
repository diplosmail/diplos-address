import { getSupabaseServerClient } from '@/lib/supabase/server';
import ExcelJS from 'exceljs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return Response.json({ error: 'No worksheet found in file' }, { status: 400 });
    }

    // Find column indices from header row
    const headerRow = worksheet.getRow(1);
    const headers: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const value = String(cell.value ?? '').toLowerCase().trim();
      headers[value] = colNumber;
    });

    // Map common column name variations
    const firstNameCol = headers['first name'] ?? headers['first_name'] ?? headers['firstname'];
    const lastNameCol = headers['last name'] ?? headers['last_name'] ?? headers['lastname'];
    const companyCol = headers['company name'] ?? headers['company_name'] ?? headers['company'] ?? headers['companyname'];
    const urlCol = headers['company url'] ?? headers['company_url'] ?? headers['url'] ?? headers['website'] ?? headers['companyurl'];

    if (!firstNameCol && !lastNameCol && !companyCol && !urlCol) {
      return Response.json({
        error: 'Could not find expected columns. Please include: First Name, Last Name, Company Name, Company URL',
      }, { status: 400 });
    }

    const contacts: {
      campaign_id: string;
      first_name: string;
      last_name: string;
      company_name: string;
      company_url: string;
    }[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header

      const firstName = firstNameCol ? String(row.getCell(firstNameCol).value ?? '').trim() : '';
      const lastName = lastNameCol ? String(row.getCell(lastNameCol).value ?? '').trim() : '';
      const companyName = companyCol ? String(row.getCell(companyCol).value ?? '').trim() : '';
      let companyUrl = urlCol ? String(row.getCell(urlCol).value ?? '').trim() : '';

      // Skip empty rows
      if (!firstName && !lastName && !companyName && !companyUrl) return;

      // Normalize URL
      if (companyUrl && !companyUrl.startsWith('http')) {
        companyUrl = `https://${companyUrl}`;
      }

      contacts.push({
        campaign_id: id,
        first_name: firstName,
        last_name: lastName,
        company_name: companyName,
        company_url: companyUrl,
      });
    });

    if (contacts.length === 0) {
      return Response.json({ error: 'No valid rows found in file' }, { status: 400 });
    }

    // Insert contacts in batches of 100
    for (let i = 0; i < contacts.length; i += 100) {
      const batch = contacts.slice(i, i + 100);
      const { error } = await supabase.from('contacts').insert(batch);
      if (error) {
        return Response.json({ error: error.message }, { status: 500 });
      }
    }

    // Update campaign contact count
    await supabase
      .from('campaigns')
      .update({ total_contacts: contacts.length })
      .eq('id', id);

    return Response.json({ count: contacts.length }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to parse file';
    return Response.json({ error: message }, { status: 400 });
  }
}
