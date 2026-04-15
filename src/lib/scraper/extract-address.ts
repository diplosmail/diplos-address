import Anthropic from '@anthropic-ai/sdk';

export interface ExtractedAddress {
  street_address: string;
  street_address_2: string | null;
  city: string;
  state_region: string;
  postal_code: string;
  country_region: string;
  confidence: 'high' | 'medium' | 'low';
  found: boolean;
}

const client = new Anthropic();

export async function extractAddressFromText(
  text: string,
  companyName: string,
  sourceUrl: string
): Promise<ExtractedAddress> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `You are extracting the headquarters/main office mailing address for the company "${companyName}" from their website content.

Website URL: ${sourceUrl}

Website content:
${text}

Extract the company's headquarters or main office physical mailing address. Look for:
- "Headquarters", "HQ", "Main Office", "Corporate Office" sections
- Contact pages with physical addresses
- Footer addresses
- About pages with location info

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "found": true/false,
  "street_address": "street address",
  "street_address_2": "suite/floor/unit or null",
  "city": "city name",
  "state_region": "2-letter state code",
  "postal_code": "zip/postal code",
  "country_region": "US",
  "confidence": "high/medium/low"
}

If you cannot find a clear physical address, set "found": false and leave other fields empty strings.`,
      },
    ],
  });

  try {
    const content = message.content[0];
    if (content.type !== 'text') {
      return { found: false, street_address: '', street_address_2: null, city: '', state_region: '', postal_code: '', country_region: 'US', confidence: 'low' };
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
      confidence: parsed.confidence || 'low',
    };
  } catch {
    return { found: false, street_address: '', street_address_2: null, city: '', state_region: '', postal_code: '', country_region: 'US', confidence: 'low' };
  }
}
