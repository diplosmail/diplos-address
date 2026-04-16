export interface MelissaResult {
  is_verified: boolean;
  is_deliverable: boolean;
  address_type: string;
  result_codes: string;
  formatted_address: {
    street_address: string;
    street_address_2: string | null;
    city: string;
    state_region: string;
    postal_code: string;
  } | null;
  raw_response: Record<string, unknown>;
}

export async function verifyAddress(
  streetAddress: string,
  streetAddress2: string | null,
  city: string,
  stateRegion: string,
  postalCode: string
): Promise<MelissaResult> {
  const apiKey = process.env.MELISSA_API_KEY;
  if (!apiKey) {
    return {
      is_verified: false,
      is_deliverable: false,
      address_type: '',
      result_codes: 'NO_API_KEY',
      formatted_address: null,
      raw_response: { error: 'MELISSA_API_KEY not configured' },
    };
  }

  const params = new URLSearchParams({
    id: apiKey,
    a1: streetAddress,
    a2: streetAddress2 || '',
    city: city,
    state: stateRegion,
    postal: postalCode,
    ctry: 'US',
    format: 'json',
  });

  try {
    const res = await fetch(
      `https://address.melissadata.net/v3/WEB/GlobalAddress/doGlobalAddress?${params}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) {
      return {
        is_verified: false,
        is_deliverable: false,
        address_type: '',
        result_codes: `HTTP_${res.status}`,
        formatted_address: null,
        raw_response: { status: res.status },
      };
    }

    const data = await res.json();
    const record = data.Records?.[0];

    if (!record) {
      return {
        is_verified: false,
        is_deliverable: false,
        address_type: '',
        result_codes: 'NO_RECORD',
        formatted_address: null,
        raw_response: data,
      };
    }

    const resultCodes = record.Results || '';
    const addressType = record.AddressType || '';
    const subPremises = (record.SubPremises || '').trim();

    // Global Address API verification codes:
    // AV24 = verified to street/building level (no suite)
    // AV25 = verified to sub-building/suite level (has suite)
    const hasAV25 = resultCodes.includes('AV25');
    const hasAV24 = resultCodes.includes('AV24');

    // Verified if:
    // - Has suite info → must have AV25
    // - No suite info → AV24 is sufficient
    const isVerified = subPremises ? hasAV25 : (hasAV24 || hasAV25);

    // Deliverable = verified AND not a PO Box (P) or Residential (R)
    // S = Street/Commercial, H = HighRise/Commercial — both deliverable
    // P = PO Box, R = Rural/Residential — not deliverable
    const isDeliverable = isVerified && addressType !== 'P' && addressType !== 'R';

    // Parse the address correctly from Melissa's response:
    // - AddressLine1 may contain "street + suite" combined (e.g. "18540 Apache Dr Unit 100")
    // - SubPremises has just the suite part (e.g. "Unit 100")
    // - We need to separate them for our street_address and street_address_2 fields
    let parsedStreet = record.AddressLine1 || streetAddress;
    let parsedStreet2: string | null = subPremises || null;

    // If AddressLine1 contains the SubPremises, strip it out for a clean street address
    if (subPremises && parsedStreet.includes(subPremises)) {
      parsedStreet = parsedStreet.replace(subPremises, '').replace(/\s+/g, ' ').trim();
      // Remove trailing comma if any
      parsedStreet = parsedStreet.replace(/,\s*$/, '').trim();
    }

    return {
      is_verified: isVerified,
      is_deliverable: isDeliverable,
      address_type: addressType,
      result_codes: resultCodes,
      formatted_address: isVerified
        ? {
            street_address: parsedStreet,
            street_address_2: parsedStreet2,
            city: record.Locality || city,
            state_region: record.AdministrativeArea || stateRegion,
            postal_code: record.PostalCode || postalCode,
          }
        : null,
      raw_response: record,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    return {
      is_verified: false,
      is_deliverable: false,
      address_type: '',
      result_codes: 'ERROR',
      formatted_address: null,
      raw_response: { error: message },
    };
  }
}
