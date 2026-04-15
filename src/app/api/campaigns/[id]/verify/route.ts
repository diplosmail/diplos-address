import { getSupabaseServerClient } from '@/lib/supabase/server';
import { verifyAddress } from '@/lib/melissa/verify';

export const maxDuration = 30;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  // Get next scraped contact (has address, needs verification)
  const { data: contact, error: fetchError } = await supabase
    .from('contacts')
    .select('*, addresses(*)')
    .eq('campaign_id', id)
    .eq('status', 'scraped')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (fetchError || !contact) {
    // No more scraped contacts to verify
    // Check if all contacts are done (complete or failed)
    const { count: pendingCount } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', id)
      .in('status', ['pending', 'scraping', 'scraped', 'verifying']);

    if (pendingCount === 0) {
      await supabase
        .from('campaigns')
        .update({ status: 'complete' })
        .eq('id', id);
    }

    return Response.json({ done: true });
  }

  const address = contact.addresses?.[0];
  if (!address) {
    // No address to verify — mark as failed
    await supabase
      .from('contacts')
      .update({ status: 'failed', error_message: 'No address to verify' })
      .eq('id', contact.id);

    await supabase.rpc('increment_processed_count', { campaign_id_input: id });

    return Response.json({
      done: false,
      contactName: `${contact.first_name} ${contact.last_name}`,
      processedCount: await getProcessedCount(supabase, id),
    });
  }

  // Mark as verifying
  await supabase
    .from('contacts')
    .update({ status: 'verifying' })
    .eq('id', contact.id);

  try {
    const melissa = await verifyAddress(
      address.street_address,
      address.street_address_2,
      address.city,
      address.state_region,
      address.postal_code
    );

    // Update address with Melissa results
    const updateData: Record<string, unknown> = {
      is_verified: melissa.is_verified,
      is_deliverable: melissa.is_deliverable,
      melissa_result: {
        ...melissa.raw_response,
        _result_codes: melissa.result_codes,
        _address_type: melissa.address_type,
      },
    };

    // If Melissa returned a formatted address, update the address fields
    if (melissa.formatted_address) {
      updateData.street_address = melissa.formatted_address.street_address;
      updateData.street_address_2 = melissa.formatted_address.street_address_2;
      updateData.city = melissa.formatted_address.city;
      updateData.state_region = melissa.formatted_address.state_region;
      updateData.postal_code = melissa.formatted_address.postal_code;
    }

    const { error: updateError } = await supabase
      .from('addresses')
      .update(updateData)
      .eq('id', address.id);

    if (updateError) {
      throw new Error(`Failed to update address: ${updateError.message}`);
    }

    // Mark contact as complete
    await supabase
      .from('contacts')
      .update({ status: 'complete' })
      .eq('id', contact.id);

    await supabase.rpc('increment_processed_count', { campaign_id_input: id });

    return Response.json({
      done: false,
      contactName: `${contact.first_name} ${contact.last_name}`,
      processedCount: await getProcessedCount(supabase, id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed';

    await supabase
      .from('contacts')
      .update({ status: 'failed', error_message: message })
      .eq('id', contact.id);

    await supabase.rpc('increment_processed_count', { campaign_id_input: id });

    return Response.json({
      done: false,
      contactName: `${contact.first_name} ${contact.last_name}`,
      processedCount: await getProcessedCount(supabase, id),
      error: message,
    });
  }
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
