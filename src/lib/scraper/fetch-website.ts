import * as cheerio from 'cheerio';

export interface WebsiteContent {
  text: string;
  url: string;
  success: boolean;
  error?: string;
}

export async function fetchWebsiteText(url: string): Promise<WebsiteContent> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DiplosAddressBot/1.0)',
        'Accept': 'text/html',
      },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return { text: '', url, success: false, error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove non-content elements
    $('script, style, nav, footer, iframe, noscript, svg, img, video, audio').remove();

    // Try to find contact/about pages linked from main page
    const contactLinks: string[] = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().toLowerCase();
      if (href && (text.includes('contact') || text.includes('about') || text.includes('location'))) {
        try {
          const resolved = new URL(href, url).href;
          if (resolved.startsWith('http')) {
            contactLinks.push(resolved);
          }
        } catch { /* skip invalid URLs */ }
      }
    });

    // Get main page text
    let pageText = $('body').text().replace(/\s+/g, ' ').trim();

    // Also fetch contact/about page if found (take first one)
    if (contactLinks.length > 0) {
      try {
        const contactRes = await fetch(contactLinks[0], {
          signal: AbortSignal.timeout(5000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; DiplosAddressBot/1.0)',
            'Accept': 'text/html',
          },
        });
        if (contactRes.ok) {
          const contactHtml = await contactRes.text();
          const $contact = cheerio.load(contactHtml);
          $contact('script, style, nav, footer, iframe, noscript, svg').remove();
          const contactText = $contact('body').text().replace(/\s+/g, ' ').trim();
          pageText += '\n\n--- CONTACT/ABOUT PAGE ---\n\n' + contactText;
        }
      } catch { /* skip if contact page fails */ }
    }

    // Truncate to ~8000 chars to keep Claude context reasonable
    if (pageText.length > 8000) {
      pageText = pageText.slice(0, 8000);
    }

    return { text: pageText, url, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch website';
    return { text: '', url, success: false, error: message };
  }
}
