import { getSupabaseServerClient } from '@/lib/supabase/server';
import { fetchWebsiteText } from '@/lib/scraper/fetch-website';
import { extractAddressFromText } from '@/lib/scraper/extract-address';
import { searchFallbackAddress } from '@/lib/scraper/fallback';
import { verifyAddress } from '@/lib/melissa/verify';
import type { AddressSource } from '@/types';

// Allow up to 60 seconds for scraping + LLM + Melissa verification
export const maxDuration = 60;

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
      street_address: string;
      street_address_2: string | null;
      city: string;
      state_region: string;
      postal_code: string;
      country_region: string;
      source: AddressSource;
      source_url: string;
    } | null = null;

    // Step 1: Try website scraping (homepage + contact/about/location pages)
    if (contact.company_url) {
      const websiteContent = await fetchWebsiteText(contact.company_url);

      if (websiteContent.success && websiteContent.pages.length > 0) {
        const extracted = await extractAddressFromText(
          websiteContent.pages,
          contact.company_name
        );

        if (extracted.found) {
          addressData = {
            street_address: extracted.street_address,
            street_address_2: extracted.street_address_2,
            city: extracted.city,
            state_region: extracted.state_region,
            postal_code: extracted.postal_code,
            country_region: extracted.country_region,
            source: 'website',
            source_url: contact.company_url,
          };
        }
      }
    }

    // Step 2: Fallback — Google Maps, then BBB/Yelp, then LLM knowledge
    if (!addressData) {
      const fallback = await searchFallbackAddress(
        contact.company_name,
        contact.company_url
      );

      if (fallback.found) {
        addressData = {
          street_address: fallback.street_address,
          street_address_2: fallback.street_address_2,
          city: fallback.city,
          state_region: fallback.state_region,
          postal_code: fallback.postal_code,
          country_region: fallback.country_region,
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
      addressData.street_address,
      addressData.street_address_2,
      addressData.city,
      addressData.state_region,
      addressData.postal_code
    );

    // Use Melissa's formatted address if verification succeeded
    const finalAddress = melissa.formatted_address || addressData;

    // Save address record
    const { error: insertError } = await supabase.from('addresses').insert({
      contact_id: contact.id,
      street_address: finalAddress.street_address,
      street_address_2: finalAddress.street_address_2,
      city: finalAddress.city,
      state_region: finalAddress.state_region,
      postal_code: finalAddress.postal_code,
      country_region: addressData.country_region,
      source: addressData.source,
      source_url: addressData.source_url,
      is_verified: melissa.is_verified,
      is_deliverable: melissa.is_deliverable,
      melissa_result: {
        ...melissa.raw_response,
        _result_codes: melissa.result_codes,
        _address_type: melissa.address_type,
      },
    });

    if (insertError) {
      throw new Error(`Failed to save address: ${insertError.message}`);
    }

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
