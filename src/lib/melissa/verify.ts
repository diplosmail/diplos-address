export interface MelissaResult {
  is_verified: boolean;
  is_deliverable: boolean;
  result_codes: string;
  formatted_address: {
    address_line1: string;
    address_line2: string | null;
    city: string;
    state: string;
    zip: string;
  } | null;
  raw_response: Record<string, unknown>;
}

export async function verifyAddress(
  addressLine1: string,
  addressLine2: string | null,
  city: string,
  state: string,
  zip: string
): Promise<MelissaResult> {
  const apiKey = process.env.MELISSA_API_KEY;
  if (!apiKey) {
    return {
      is_verified: false,
      is_deliverable: false,
      result_codes: 'NO_API_KEY',
      formatted_address: null,
      raw_response: { error: 'MELISSA_API_KEY not configured' },
    };
  }

  const params = new URLSearchParams({
    id: apiKey,
    a1: addressLine1,
    a2: addressLine2 || '',
    city: city,
    state: state,
    postal: zip,
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
        result_codes: 'NO_RECORD',
        formatted_address: null,
        raw_response: data,
      };
    }

    const resultCodes = record.Results || '';
    // Melissa result codes: AV = Address Verified
    // AS01 = Address verified to street level
    // AS02 = Address verified to building/suite level
    // AS03 = Address verified to premise/mailbox level
    const isVerified = resultCodes.includes('AV');
    // Check for deliverability - no error codes (AE = Address Error)
    const isDeliverable = isVerified && !resultCodes.includes('AE');

    return {
      is_verified: isVerified,
      is_deliverable: isDeliverable,
      result_codes: resultCodes,
      formatted_address: isVerified
        ? {
            address_line1: record.AddressLine1 || addressLine1,
            address_line2: record.AddressLine2 || addressLine2,
            city: record.Locality || city,
            state: record.AdministrativeArea || state,
            zip: record.PostalCode || zip,
          }
        : null,
      raw_response: record,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    return {
      is_verified: false,
      is_deliverable: false,
      result_codes: 'ERROR',
      formatted_address: null,
      raw_response: { error: message },
    };
  }
}
