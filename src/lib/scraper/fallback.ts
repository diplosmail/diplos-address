import Anthropic from '@anthropic-ai/sdk';

export interface FallbackAddress {
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  source: 'google_maps' | 'other';
  found: boolean;
}

const client = new Anthropic();

export async function searchFallbackAddress(
  companyName: string,
  companyUrl: string
): Promise<FallbackAddress> {
  // Use Claude with web search via a Google Maps search approach
  // We construct a search-friendly query and ask Claude to find the address
  // from its training data (which includes Google Maps/business listings)
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
  "address_line1": "street address",
  "address_line2": "suite/floor/unit or null",
  "city": "city name",
  "state": "2-letter state code",
  "zip": "zip code",
  "country": "US",
  "source": "google_maps" or "other"
}

Only set "found": true if you are reasonably confident about the address. If unsure, set "found": false.`,
      },
    ],
  });

  try {
    const content = message.content[0];
    if (content.type !== 'text') {
      return { found: false, address_line1: '', address_line2: null, city: '', state: '', zip: '', country: 'US', source: 'other' };
    }

    let jsonStr = content.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(jsonStr);
    return {
      found: Boolean(parsed.found),
      address_line1: parsed.address_line1 || '',
      address_line2: parsed.address_line2 || null,
      city: parsed.city || '',
      state: parsed.state || '',
      zip: parsed.zip || '',
      country: parsed.country || 'US',
      source: parsed.source === 'google_maps' ? 'google_maps' : 'other',
    };
  } catch {
    return { found: false, address_line1: '', address_line2: null, city: '', state: '', zip: '', country: 'US', source: 'other' };
  }
}
