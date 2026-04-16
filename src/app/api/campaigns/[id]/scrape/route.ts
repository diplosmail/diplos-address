import { getSupabaseServerClient } from '@/lib/supabase/server';
import { fetchWebsiteText } from '@/lib/scraper/fetch-website';
import { extractAddressFromText } from '@/lib/scraper/extract-address';
import { searchFallbackAddress } from '@/lib/scraper/fallback';
import type { AddressSource } from '@/types';

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
    return Response.json({ done: true });
  }

  // Mark as scraping
  await supabase
    .from('contacts')
    .update({ status: 'scraping' })
    .eq('id', contact.id);

  // Update campaign status
  await supabase
    .from('campaigns')
    .update({ status: 'processing' })
    .eq('id', id);

  try {
    // Dedup: Check if another contact in this campaign with the same company_url
    // already has an address. If so, copy it instead of scraping again.
    if (contact.company_url) {
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id, addresses(*)')
        .eq('campaign_id', id)
        .eq('company_url', contact.company_url)
        .in('status', ['scraped', 'verifying', 'complete'])
        .neq('id', contact.id)
        .limit(1)
        .single();

      const existingAddress = existingContact?.addresses?.[0];
      if (existingAddress) {
        // Copy the address for this contact
        const { error: copyError } = await supabase.from('addresses').insert({
          contact_id: contact.id,
          street_address: existingAddress.street_address,
          street_address_2: existingAddress.street_address_2,
          city: existingAddress.city,
          state_region: existingAddress.state_region,
          postal_code: existingAddress.postal_code,
          country_region: existingAddress.country_region,
          source: existingAddress.source,
          source_url: existingAddress.source_url,
          is_verified: existingAddress.is_verified,
          is_deliverable: existingAddress.is_deliverable,
          melissa_result: existingAddress.melissa_result,
        });

        if (!copyError) {
          // If the source was already verified, mark complete; otherwise scraped
          const newStatus = existingAddress.is_verified ? 'complete' : 'scraped';
          await supabase
            .from('contacts')
            .update({ status: newStatus })
            .eq('id', contact.id);

          await supabase.rpc('increment_scraped_count', { campaign_id_input: id });

          return Response.json({
            done: false,
            contactName: `${contact.first_name} ${contact.last_name} (reused from ${contact.company_name})`,
            scrapedCount: await getScrapedCount(supabase, id),
          });
        }
      }
    }

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
      await supabase
        .from('contacts')
        .update({
          status: 'failed',
          error_message: 'Could not find address from website or public data',
        })
        .eq('id', contact.id);

      await supabase.rpc('increment_scraped_count', { campaign_id_input: id });

      return Response.json({
        done: false,
        contactName: `${contact.first_name} ${contact.last_name}`,
        scrapedCount: await getScrapedCount(supabase, id),
      });
    }

    // Save address record (unverified)
    const { error: insertError } = await supabase.from('addresses').insert({
      contact_id: contact.id,
      street_address: addressData.street_address,
      street_address_2: addressData.street_address_2,
      city: addressData.city,
      state_region: addressData.state_region,
      postal_code: addressData.postal_code,
      country_region: addressData.country_region,
      source: addressData.source,
      source_url: addressData.source_url,
      is_verified: false,
      is_deliverable: false,
    });

    if (insertError) {
      throw new Error(`Failed to save address: ${insertError.message}`);
    }

    // Mark contact as scraped (ready for verification)
    await supabase
      .from('contacts')
      .update({ status: 'scraped' })
      .eq('id', contact.id);

    await supabase.rpc('increment_scraped_count', { campaign_id_input: id });

    return Response.json({
      done: false,
      contactName: `${contact.first_name} ${contact.last_name}`,
      scrapedCount: await getScrapedCount(supabase, id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scraping failed';

    await supabase
      .from('contacts')
      .update({ status: 'failed', error_message: message })
      .eq('id', contact.id);

    await supabase.rpc('increment_scraped_count', { campaign_id_input: id });

    return Response.json({
      done: false,
      contactName: `${contact.first_name} ${contact.last_name}`,
      scrapedCount: await getScrapedCount(supabase, id),
      error: message,
    });
  }
}

async function getScrapedCount(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  campaignId: string
): Promise<number> {
  const { data } = await supabase
    .from('campaigns')
    .select('scraped_count')
    .eq('id', campaignId)
    .single();
  return data?.scraped_count ?? 0;
}
