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
  pages: { url: string; text: string }[],
  companyName: string
): Promise<ExtractedAddress> {
  // Build context from all scraped pages, truncating each to keep total reasonable
  const maxPerPage = Math.floor(12000 / pages.length);
  const pagesContext = pages
    .map((p, i) => {
      const truncated = p.text.length > maxPerPage ? p.text.slice(0, maxPerPage) : p.text;
      return `=== PAGE ${i + 1}: ${p.url} ===\n${truncated}`;
    })
    .join('\n\n');

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are an expert at finding company headquarters addresses from website content. Your task is to find the physical mailing address for "${companyName}".

I have scraped ${pages.length} page(s) from their website. Carefully review ALL the content below.

${pagesContext}

INSTRUCTIONS:
1. Look carefully through ALL pages for a physical street address
2. Prioritize addresses labeled as: "Headquarters", "HQ", "Corporate Office", "Main Office", "Corporate Headquarters"
3. Check these locations in order of priority:
   - Contact page content
   - Footer sections (addresses are very commonly in footers)
   - About page content
   - Structured address data (schema.org markup, vcard)
   - Any other page content
4. If multiple addresses exist, pick the HEADQUARTERS / main office
5. Parse the address into structured components

Respond with ONLY a JSON object (no markdown, no code blocks, no explanation):
{"found": true, "street_address": "18540 Apache Dr.", "street_address_2": "Unit 100", "city": "Parker", "state_region": "CO", "postal_code": "80134", "country_region": "US", "confidence": "high"}

Rules:
- street_address_2 should be null if there is no suite/unit/floor
- state_region should be the 2-letter state code
- confidence: "high" = clearly labeled HQ address, "medium" = address found but not explicitly HQ, "low" = partial or uncertain
- If you truly cannot find ANY physical address, respond: {"found": false, "street_address": "", "street_address_2": null, "city": "", "state_region": "", "postal_code": "", "country_region": "US", "confidence": "low"}`,
      },
    ],
  });

  try {
    const content = message.content[0];
    if (content.type !== 'text') {
      return notFound();
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
    return notFound();
  }
}

function notFound(): ExtractedAddress {
  return { found: false, street_address: '', street_address_2: null, city: '', state_region: '', postal_code: '', country_region: 'US', confidence: 'low' };
}
