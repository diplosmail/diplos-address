import Anthropic from '@anthropic-ai/sdk';

export interface FallbackAddress {
  street_address: string;
  street_address_2: string | null;
  city: string;
  state_region: string;
  postal_code: string;
  country_region: string;
  source: 'google_maps' | 'other';
  found: boolean;
}

const client = new Anthropic();

export async function searchFallbackAddress(
  companyName: string,
  companyUrl: string
): Promise<FallbackAddress> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `I need the headquarters/main office physical mailing address for this company:

Company Name: ${companyName}
Company Website: ${companyUrl}

I could not find the address on their website. Please provide the company's headquarters address from your knowledge of public business data (Google Maps listings, SEC filings, business registrations, etc.).

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "found": true/false,
  "street_address": "street address",
  "street_address_2": "suite/floor/unit or null",
  "city": "city name",
  "state_region": "2-letter state code",
  "postal_code": "zip/postal code",
  "country_region": "US",
  "source": "google_maps" or "other"
}

Only set "found": true if you are reasonably confident about the address. If unsure, set "found": false.`,
      },
    ],
  });

  try {
    const content = message.content[0];
    if (content.type !== 'text') {
      return { found: false, street_address: '', street_address_2: null, city: '', state_region: '', postal_code: '', country_region: 'US', source: 'other' };
    }

    let jsonStr = content.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonStr);
    return {
      found: Boolean(parsed.found),
      street_address: parsed.street_address || '',
      street_address_2: parsed.street_address_2 || null,
      city: parsed.city || '',
      state_region: parsed.state_region || '',
      postal_code: parsed.postal_code || '',
      country_region: parsed.country_region || 'US',
      source: parsed.source === 'google_maps' ? 'google_maps' : 'other',
    };
  } catch {
    return { found: false, street_address: '', street_address_2: null, city: '', state_region: '', postal_code: '', country_region: 'US', source: 'other' };
  }
}
