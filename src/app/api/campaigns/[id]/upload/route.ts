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
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    const contacts: {
      campaign_id: string;
      first_name: string;
      last_name: string;
      company_name: string;
      company_url: string;
    }[] = [];

    if (isCsv) {
      const text = await file.text();
      const rows = parseCsv(text);

      if (rows.length < 2) {
        return Response.json({ error: 'CSV file is empty or has no data rows' }, { status: 400 });
      }

      // Build header map
      const headers: Record<string, number> = {};
      rows[0].forEach((val, i) => {
        headers[val.toLowerCase().trim()] = i;
      });

      const firstNameCol = headers['first name'] ?? headers['first_name'] ?? headers['firstname'];
      const lastNameCol = headers['last name'] ?? headers['last_name'] ?? headers['lastname'];
      const companyCol = headers['company name'] ?? headers['company_name'] ?? headers['company'] ?? headers['companyname'];
      const urlCol = headers['company url'] ?? headers['company_url'] ?? headers['url'] ?? headers['website'] ?? headers['companyurl'];

      if (firstNameCol === undefined && lastNameCol === undefined && companyCol === undefined && urlCol === undefined) {
        return Response.json({
          error: 'Could not find expected columns. Please include: First Name, Last Name, Company Name, Company URL',
        }, { status: 400 });
      }

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const firstName = firstNameCol !== undefined ? (row[firstNameCol] ?? '').trim() : '';
        const lastName = lastNameCol !== undefined ? (row[lastNameCol] ?? '').trim() : '';
        const companyName = companyCol !== undefined ? (row[companyCol] ?? '').trim() : '';
        let companyUrl = urlCol !== undefined ? (row[urlCol] ?? '').trim() : '';

        if (!firstName && !lastName && !companyName && !companyUrl) continue;

        if (companyUrl && !companyUrl.startsWith('http')) {
          companyUrl = `https://${companyUrl}`;
        }

        contacts.push({ campaign_id: id, first_name: firstName, last_name: lastName, company_name: companyName, company_url: companyUrl });
      }
    } else {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return Response.json({ error: 'No worksheet found in file' }, { status: 400 });
      }

      const headerRow = worksheet.getRow(1);
      const headers: Record<string, number> = {};
      headerRow.eachCell((cell, colNumber) => {
        const value = String(cell.value ?? '').toLowerCase().trim();
        headers[value] = colNumber;
      });

      const firstNameCol = headers['first name'] ?? headers['first_name'] ?? headers['firstname'];
      const lastNameCol = headers['last name'] ?? headers['last_name'] ?? headers['lastname'];
      const companyCol = headers['company name'] ?? headers['company_name'] ?? headers['company'] ?? headers['companyname'];
      const urlCol = headers['company url'] ?? headers['company_url'] ?? headers['url'] ?? headers['website'] ?? headers['companyurl'];

      if (!firstNameCol && !lastNameCol && !companyCol && !urlCol) {
        return Response.json({
          error: 'Could not find expected columns. Please include: First Name, Last Name, Company Name, Company URL',
        }, { status: 400 });
      }

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const firstName = firstNameCol ? String(row.getCell(firstNameCol).value ?? '').trim() : '';
        const lastName = lastNameCol ? String(row.getCell(lastNameCol).value ?? '').trim() : '';
        const companyName = companyCol ? String(row.getCell(companyCol).value ?? '').trim() : '';
        let companyUrl = urlCol ? String(row.getCell(urlCol).value ?? '').trim() : '';

        if (!firstName && !lastName && !companyName && !companyUrl) return;

        if (companyUrl && !companyUrl.startsWith('http')) {
          companyUrl = `https://${companyUrl}`;
        }

        contacts.push({ campaign_id: id, first_name: firstName, last_name: lastName, company_name: companyName, company_url: companyUrl });
      });
    }

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

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current);
        current = '';
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        row.push(current);
        current = '';
        if (row.some((cell) => cell.trim())) rows.push(row);
        row = [];
        if (ch === '\r') i++;
      } else {
        current += ch;
      }
    }
  }

  // Last row
  row.push(current);
  if (row.some((cell) => cell.trim())) rows.push(row);

  return rows;
}
