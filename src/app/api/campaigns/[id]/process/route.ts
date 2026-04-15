import { getSupabaseServerClient } from '@/lib/supabase/server';
import { fetchWebsiteText } from '@/lib/scraper/fetch-website';
import { extractAddressFromText } from '@/lib/scraper/extract-address';
import { searchFallbackAddress } from '@/lib/scraper/fallback';
import { verifyAddress } from '@/lib/melissa/verify';
import type { AddressSource } from '@/types';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  // Get next pending contact
  const { data: contact, error: fetchError } = await supabase
    .from('contacts')
    .select('*')
    .eq('campaign_id', id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (fetchError || !contact) {
    // No more pending contacts — mark campaign complete
    await supabase
      .from('campaigns')
      .update({ status: 'complete' })
      .eq('id', id);

    return Response.json({ done: true });
  }

  // Mark as scraping
  await supabase
    .from('contacts')
    .update({ status: 'scraping' })
    .eq('id', contact.id);

  // Update campaign status to processing
  await supabase
    .from('campaigns')
    .update({ status: 'processing' })
    .eq('id', id);

  try {
    let addressData: {
      address_line1: string;
      address_line2: string | null;
      city: string;
      state: string;
      zip: string;
      country: string;
      source: AddressSource;
      source_url: string;
    } | null = null;

    // Step 1: Try website scraping
    if (contact.company_url) {
      const websiteContent = await fetchWebsiteText(contact.company_url);

      if (websiteContent.success && websiteContent.text) {
        const extracted = await extractAddressFromText(
          websiteContent.text,
          contact.company_name,
          contact.company_url
        );

        if (extracted.found) {
          addressData = {
            address_line1: extracted.address_line1,
            address_line2: extracted.address_line2,
            city: extracted.city,
            state: extracted.state,
            zip: extracted.zip,
            country: extracted.country,
            source: 'website',
            source_url: contact.company_url,
          };
        }
      }
    }

    // Step 2: Fallback if website scraping failed
    if (!addressData) {
      const fallback = await searchFallbackAddress(
        contact.company_name,
        contact.company_url
      );

      if (fallback.found) {
        addressData = {
          address_line1: fallback.address_line1,
          address_line2: fallback.address_line2,
          city: fallback.city,
          state: fallback.state,
          zip: fallback.zip,
          country: fallback.country,
          source: fallback.source,
          source_url: contact.company_url,
        };
      }
    }

    if (!addressData) {
      // Could not find address from any source
      await supabase
        .from('contacts')
        .update({
          status: 'failed',
          error_message: 'Could not find address from website or public data',
        })
        .eq('id', contact.id);

      await incrementProcessedCount(supabase, id);

      return Response.json({
        done: false,
        contactName: `${contact.first_name} ${contact.last_name}`,
        processedCount: await getProcessedCount(supabase, id),
      });
    }

    // Step 3: Verify with Melissa
    await supabase
      .from('contacts')
      .update({ status: 'verifying' })
      .eq('id', contact.id);

    const melissa = await verifyAddress(
      addressData.address_line1,
      addressData.address_line2,
      addressData.city,
      addressData.state,
      addressData.zip
    );

    // Use Melissa's formatted address if verification succeeded
    const finalAddress = melissa.formatted_address || addressData;

    // Save address record
    await supabase.from('addresses').insert({
      contact_id: contact.id,
      address_line1: finalAddress.address_line1,
      address_line2: finalAddress.address_line2,
      city: finalAddress.city,
      state: finalAddress.state,
      zip: finalAddress.zip,
      country: addressData.country,
      source: addressData.source,
      source_url: addressData.source_url,
      is_verified: melissa.is_verified,
      is_deliverable: melissa.is_deliverable,
      melissa_result: melissa.raw_response,
    });

    // Mark contact as complete
    await supabase
      .from('contacts')
      .update({ status: 'complete' })
      .eq('id', contact.id);

    await incrementProcessedCount(supabase, id);

    return Response.json({
      done: false,
      contactName: `${contact.first_name} ${contact.last_name}`,
      processedCount: await getProcessedCount(supabase, id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Processing failed';

    await supabase
      .from('contacts')
      .update({ status: 'failed', error_message: message })
      .eq('id', contact.id);

    await incrementProcessedCount(supabase, id);

    return Response.json({
      done: false,
      contactName: `${contact.first_name} ${contact.last_name}`,
      processedCount: await getProcessedCount(supabase, id),
      error: message,
    });
  }
}

async function incrementProcessedCount(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  campaignId: string
) {
  await supabase.rpc('increment_processed_count', { campaign_id_input: campaignId });
}

async function getProcessedCount(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  campaignId: string
): Promise<number> {
  const { data } = await supabase
    .from('campaigns')
    .select('processed_count')
    .eq('id', campaignId)
    .single();
  return data?.processed_count ?? 0;
}
