import * as cheerio from 'cheerio';

export interface WebsiteContent {
  pages: { url: string; text: string }[];
  success: boolean;
  error?: string;
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

// Patterns for links that likely contain address info
const CONTACT_LINK_PATTERNS = [
  /contact/i, /about/i, /location/i, /office/i, /headquarter/i,
  /find-us/i, /visit/i, /directions/i, /where-we-are/i,
];

const CONTACT_HREF_PATTERNS = [
  /\/contact/i, /\/about/i, /\/location/i, /\/office/i,
  /\/headquarter/i, /\/find-us/i, /\/visit/i, /\/directions/i,
  /\/company/i, /\/who-we-are/i, /\/our-story/i,
];

function extractPageText($: cheerio.CheerioAPI): string {
  // Remove scripts, styles, and non-content elements — but KEEP footer (addresses live there)
  $('script, style, iframe, noscript, svg, img, video, audio, link, meta').remove();

  // Get the full body text
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  // Also specifically extract footer content for emphasis
  const footerText = $('footer').text().replace(/\s+/g, ' ').trim();

  // Extract structured address-like elements (schema.org, vcard, etc.)
  const structuredParts: string[] = [];
  $('[itemtype*="PostalAddress"], [class*="address"], [class*="location"], [class*="contact"], [id*="address"], [id*="location"], [id*="contact"]').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 10 && text.length < 500) {
      structuredParts.push(text);
    }
  });

  let result = '';

  if (structuredParts.length > 0) {
    result += '--- STRUCTURED ADDRESS DATA ---\n' + structuredParts.join('\n') + '\n\n';
  }

  if (footerText && footerText.length > 10) {
    result += '--- FOOTER ---\n' + footerText + '\n\n';
  }

  result += '--- PAGE CONTENT ---\n' + bodyText;

  return result;
}

async function fetchPage(url: string): Promise<{ html: string; ok: boolean }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: FETCH_HEADERS,
      redirect: 'follow',
    });
    if (!res.ok) return { html: '', ok: false };
    return { html: await res.text(), ok: true };
  } catch {
    return { html: '', ok: false };
  }
}

function findContactLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const found = new Set<string>();

  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().toLowerCase().trim();

    const textMatch = CONTACT_LINK_PATTERNS.some((p) => p.test(text));
    const hrefMatch = CONTACT_HREF_PATTERNS.some((p) => p.test(href));

    if (textMatch || hrefMatch) {
      try {
        const resolved = new URL(href, baseUrl).href;
        // Only follow links on the same domain
        if (new URL(resolved).hostname === new URL(baseUrl).hostname) {
          found.add(resolved);
        }
      } catch { /* skip */ }
    }
  });

  return [...found];
}

export async function fetchWebsiteText(url: string): Promise<WebsiteContent> {
  try {
    // Step 1: Fetch the homepage
    const homepage = await fetchPage(url);
    if (!homepage.ok) {
      return { pages: [], success: false, error: `Could not fetch ${url}` };
    }

    const $home = cheerio.load(homepage.html);
    const homeText = extractPageText($home);
    const pages = [{ url, text: homeText }];

    // Step 2: Find and fetch contact/about/location pages (up to 3)
    const contactLinks = findContactLinks($home, url);
    const toFetch = contactLinks.slice(0, 3);

    const subpageResults = await Promise.all(
      toFetch.map(async (link) => {
        const page = await fetchPage(link);
        if (!page.ok) return null;
        const $page = cheerio.load(page.html);
        return { url: link, text: extractPageText($page) };
      })
    );

    for (const result of subpageResults) {
      if (result && result.text.length > 50) {
        pages.push(result);
      }
    }

    return { pages, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch website';
    return { pages: [], success: false, error: message };
  }
}
