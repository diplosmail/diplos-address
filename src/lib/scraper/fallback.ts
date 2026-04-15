import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';

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

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: FETCH_HEADERS,
      redirect: 'follow',
    });
    if (!res.ok) return '';
    const html = await res.text();
    const $ = cheerio.load(html);
    $('script, style, iframe, noscript, svg, img, video, audio').remove();
    return $('body').text().replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

// Tier 2: Google Maps search
async function searchGoogleMaps(companyName: string): Promise<string> {
  const query = encodeURIComponent(`${companyName} headquarters address`);
  const url = `https://www.google.com/maps/search/${query}`;
  return fetchPageText(url);
}

// Tier 3: BBB, Yelp, and other public directories
async function searchPublicDirectories(companyName: string): Promise<{ source: string; text: string }[]> {
  const results: { source: string; text: string }[] = [];

  const searches = [
    {
      source: 'BBB',
      url: `https://www.google.com/search?q=${encodeURIComponent(`"${companyName}" site:bbb.org address`)}`,
    },
    {
      source: 'Yelp/directories',
      url: `https://www.google.com/search?q=${encodeURIComponent(`"${companyName}" headquarters address yelp OR bloomberg OR crunchbase`)}`,
    },
  ];

  const fetches = await Promise.all(
    searches.map(async (s) => {
      const text = await fetchPageText(s.url);
      return { source: s.source, text };
    })
  );

  for (const f of fetches) {
    if (f.text.length > 50) {
      results.push(f);
    }
  }

  return results;
}

export async function searchFallbackAddress(
  companyName: string,
  companyUrl: string
): Promise<FallbackAddress> {
  // Tier 2: Try Google Maps
  const googleMapsText = await searchGoogleMaps(companyName);

  if (googleMapsText.length > 100) {
    const result = await extractWithLLM(companyName, companyUrl, googleMapsText, 'Google Maps');
    if (result.found) {
      return { ...result, source: 'google_maps' };
    }
  }

  // Tier 3: Try public directories (BBB, Yelp, etc.)
  const directoryResults = await searchPublicDirectories(companyName);

  if (directoryResults.length > 0) {
    const combinedText = directoryResults
      .map((r) => `--- ${r.source} ---\n${r.text.slice(0, 3000)}`)
      .join('\n\n');

    const result = await extractWithLLM(companyName, companyUrl, combinedText, 'public directories (BBB, Yelp, etc.)');
    if (result.found) {
      return { ...result, source: 'other' };
    }
  }

  // Final attempt: Ask Claude from its training knowledge
  const result = await extractFromKnowledge(companyName, companyUrl);
  return result;
}

async function extractWithLLM(
  companyName: string,
  companyUrl: string,
  sourceText: string,
  sourceName: string
): Promise<Omit<FallbackAddress, 'source'>> {
  const truncated = sourceText.length > 6000 ? sourceText.slice(0, 6000) : sourceText;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Find the headquarters address for "${companyName}" (${companyUrl}) from this ${sourceName} data:

${truncated}

Respond with ONLY a JSON object:
{"found": true/false, "street_address": "...", "street_address_2": "... or null", "city": "...", "state_region": "XX", "postal_code": "...", "country_region": "US"}

Only set found=true if you can identify a specific street address. No markdown, no explanation.`,
      },
    ],
  });

  return parseResponse(message);
}

async function extractFromKnowledge(
  companyName: string,
  companyUrl: string
): Promise<FallbackAddress> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `I need the headquarters physical mailing address for:

Company: ${companyName}
Website: ${companyUrl}

I could NOT find it on their website, Google Maps, or public directories.

From your training knowledge of business data (SEC filings, business registrations, news articles, etc.), do you know this company's headquarters address?

Respond with ONLY a JSON object:
{"found": true/false, "street_address": "...", "street_address_2": "... or null", "city": "...", "state_region": "XX", "postal_code": "...", "country_region": "US"}

IMPORTANT: Only set found=true if you are genuinely confident. It's better to return found=false than an incorrect address.`,
      },
    ],
  });

  const result = parseResponse(message);
  return { ...result, source: result.found ? 'other' : 'other' };
}

function parseResponse(message: Anthropic.Message): Omit<FallbackAddress, 'source'> & { source: 'google_maps' | 'other' } {
  try {
    const content = message.content[0];
    if (content.type !== 'text') return notFound();

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
      source: 'other',
    };
  } catch {
    return notFound();
  }
}

function notFound(): FallbackAddress {
  return { found: false, street_address: '', street_address_2: null, city: '', state_region: '', postal_code: '', country_region: 'US', source: 'other' };
}
