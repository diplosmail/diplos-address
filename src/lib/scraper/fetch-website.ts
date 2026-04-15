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

// High-priority patterns — these pages almost always have addresses
const HIGH_PRIORITY_HREF = [/\/contact/i, /\/location/i, /\/office/i, /\/headquarter/i, /\/find-us/i, /\/directions/i];
const HIGH_PRIORITY_TEXT = [/contact/i, /location/i, /office/i, /headquarter/i, /find.?us/i, /directions/i];

// Lower priority — sometimes have addresses
const LOW_PRIORITY_HREF = [/\/about/i, /\/company/i, /\/who-we-are/i, /\/our-story/i];
const LOW_PRIORITY_TEXT = [/about/i, /visit/i, /where.?we.?are/i];

function findContactLinks($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const highPriority: string[] = [];
  const lowPriority: string[] = [];

  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().toLowerCase().trim();

    // Skip sub-pages that never have addresses (careers, mission, vision, etc.)
    if (/career|job|mission|vision|value|team|affiliation|news|blog|press|faq|privacy|terms|login|sign/i.test(href)) return;
    if (/career|job|mission|vision|value|team|affiliation|news|blog|press|faq|privacy|terms/i.test(text)) return;

    const isHighText = HIGH_PRIORITY_TEXT.some((p) => p.test(text));
    const isHighHref = HIGH_PRIORITY_HREF.some((p) => p.test(href));
    const isLowText = LOW_PRIORITY_TEXT.some((p) => p.test(text));
    const isLowHref = LOW_PRIORITY_HREF.some((p) => p.test(href));

    if (isHighText || isHighHref || isLowText || isLowHref) {
      try {
        const resolved = new URL(href, baseUrl).href;
        if (new URL(resolved).hostname === new URL(baseUrl).hostname) {
          if (isHighText || isHighHref) {
            if (!highPriority.includes(resolved)) highPriority.push(resolved);
          } else {
            if (!lowPriority.includes(resolved)) lowPriority.push(resolved);
          }
        }
      } catch { /* skip */ }
    }
  });

  // High priority first, then low priority
  return [...highPriority, ...lowPriority];
}

// Common contact page URL slugs to try directly (high priority first)
const COMMON_CONTACT_SLUGS = [
  '/contact', '/contact-us', '/contact-us-2',
  '/locations', '/location', '/offices', '/headquarters',
  '/about', '/about-us',
];

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

    // Step 2: Find contact/about/location pages from links (prioritized)
    const contactLinks = findContactLinks($home, url);

    // Step 3: Also try common contact URL slugs (deduplicated)
    const baseOrigin = new URL(url).origin;
    for (const slug of COMMON_CONTACT_SLUGS) {
      const candidate = baseOrigin + slug;
      if (!contactLinks.includes(candidate) && !contactLinks.includes(candidate + '/')) {
        contactLinks.push(candidate);
      }
    }

    // Fetch up to 5 subpages — contact/location pages come first
    const toFetch = contactLinks.slice(0, 5);

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
