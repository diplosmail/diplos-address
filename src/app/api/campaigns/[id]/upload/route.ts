import { getSupabaseServerClient } from '@/lib/supabase/server';
import ExcelJS from 'exceljs';

// Each required column has a list of patterns to match against (case-insensitive)
const COLUMN_MATCHERS: Record<string, string[]> = {
  crm_id: ['record id', 'record_id', 'recordid', 'crm id', 'crm_id', 'crmid', 'id', 'hubspot id', 'salesforce id', 'contact id'],
  first_name: ['first name', 'first_name', 'firstname'],
  last_name: ['last name', 'last_name', 'lastname'],
  company_name: ['company name', 'company_name', 'companyname', 'company', 'associated company', 'associated company (primary)', 'organization', 'org'],
  company_url: ['company url', 'company_url', 'companyurl', 'website url', 'website_url', 'websiteurl', 'website', 'url', 'domain', 'web'],
};

const REQUIRED_COLUMNS = ['crm_id', 'first_name', 'last_name', 'company_name', 'company_url'];

const FRIENDLY_NAMES: Record<string, string> = {
  crm_id: 'CRM ID (e.g. "Record ID")',
  first_name: 'First Name',
  last_name: 'Last Name',
  company_name: 'Company Name (e.g. "Associated Company (Primary)")',
  company_url: 'Website URL (e.g. "Website URL")',
};

function findColumn(headers: Record<string, number>, field: string): number | undefined {
  const patterns = COLUMN_MATCHERS[field] || [];
  for (const pattern of patterns) {
    if (headers[pattern] !== undefined) return headers[pattern];
  }
  return undefined;
}

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

    // Parse headers based on file type
    let headers: Record<string, number> = {};
    let dataRows: { getCell: (col: number) => string }[] = [];

    if (isCsv) {
      const text = await file.text();
      const rows = parseCsv(text);

      if (rows.length < 2) {
        return Response.json({ error: 'CSV file is empty or has no data rows' }, { status: 400 });
      }

      rows[0].forEach((val, i) => {
        headers[val.toLowerCase().trim()] = i;
      });

      dataRows = rows.slice(1).map((row) => ({
        getCell: (col: number) => (row[col] ?? '').trim(),
      }));
    } else {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return Response.json({ error: 'No worksheet found in file' }, { status: 400 });
      }

      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell, colNumber) => {
        const value = String(cell.value ?? '').toLowerCase().trim();
        headers[value] = colNumber;
      });

      const rows: { getCell: (col: number) => string }[] = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        rows.push({
          getCell: (col: number) => {
            const cellValue = row.getCell(col).value;
            // Handle hyperlink objects from Excel
            if (cellValue && typeof cellValue === 'object' && 'hyperlink' in cellValue) {
              return String((cellValue as { hyperlink: string }).hyperlink ?? '').trim();
            }
            if (cellValue && typeof cellValue === 'object' && 'text' in cellValue) {
              return String((cellValue as { text: string }).text ?? '').trim();
            }
            return String(cellValue ?? '').trim();
          },
        });
      });
      dataRows = rows;
    }

    // Find columns with flexible matching
    const columnMap: Record<string, number | undefined> = {};
    for (const field of REQUIRED_COLUMNS) {
      columnMap[field] = findColumn(headers, field);
    }

    // Validate all required columns are present
    const missingColumns = REQUIRED_COLUMNS.filter((field) => columnMap[field] === undefined);
    if (missingColumns.length > 0) {
      const foundHeaders = Object.keys(headers).map((h) => `"${h}"`).join(', ');
      const missingNames = missingColumns.map((f) => FRIENDLY_NAMES[f]).join(', ');
      return Response.json({
        error: `Missing required columns: ${missingNames}.\n\nColumns found in your file: ${foundHeaders}.\n\nPlease ensure your file has columns for: CRM ID, First Name, Last Name, Company Name, and Website URL.`,
      }, { status: 400 });
    }

    // Parse data rows
    const contacts: {
      campaign_id: string;
      crm_id: string;
      first_name: string;
      last_name: string;
      company_name: string;
      company_url: string;
    }[] = [];

    for (const row of dataRows) {
      const crmId = row.getCell(columnMap.crm_id!);
      const firstName = row.getCell(columnMap.first_name!);
      const lastName = row.getCell(columnMap.last_name!);
      const companyName = row.getCell(columnMap.company_name!);
      let companyUrl = row.getCell(columnMap.company_url!);

      // Skip empty rows
      if (!crmId && !firstName && !lastName && !companyName && !companyUrl) continue;

      // Normalize URL
      if (companyUrl && !companyUrl.startsWith('http')) {
        companyUrl = `https://${companyUrl}`;
      }

      contacts.push({
        campaign_id: id,
        crm_id: crmId,
        first_name: firstName,
        last_name: lastName,
        company_name: companyName,
        company_url: companyUrl,
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
