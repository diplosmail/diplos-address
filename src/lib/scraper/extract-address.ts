import Anthropic from '@anthropic-ai/sdk';

export interface ExtractedAddress {
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
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
  "address_line1": "street address",
  "address_line2": "suite/floor/unit or null",
  "city": "city name",
  "state": "2-letter state code",
  "zip": "zip code",
  "country": "US",
  "confidence": "high/medium/low"
}

If you cannot find a clear physical address, set "found": false and leave other fields empty strings.`,
      },
    ],
  });

  try {
    const content = message.content[0];
    if (content.type !== 'text') {
      return { found: false, address_line1: '', address_line2: null, city: '', state: '', zip: '', country: 'US', confidence: 'low' };
    }

    // Clean the response - strip markdown code blocks if present
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
      confidence: parsed.confidence || 'low',
    };
  } catch {
    return { found: false, address_line1: '', address_line2: null, city: '', state: '', zip: '', country: 'US', confidence: 'low' };
  }
}
