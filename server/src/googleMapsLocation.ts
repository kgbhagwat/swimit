import { asLatLng } from './geo.js';

export type ParsedGoogleLocation = {
  latitude: number;
  longitude: number;
  googleMapsUrl: string;
};

const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co']);

function extractCoordsFromText(text: string): { lat: number; lng: number } | null {
  const patterns: RegExp[] = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,\d+(?:\.\d+)?z)?/i,
    /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
    /\/search\/(-?\d+(?:\.\d+)?),\+?(-?\d+(?:\.\d+)?)/i,
    /\/place\/[^/]+\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
    /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const coords = asLatLng(Number(m[1]), Number(m[2]));
    if (coords) return coords;
  }
  return null;
}

async function resolveRedirectUrl(url: string): Promise<string> {
  let current = url;
  for (let i = 0; i < 6; i += 1) {
    let host = '';
    try {
      host = new URL(current).hostname.toLowerCase();
    } catch {
      return current;
    }
    if (!SHORT_HOSTS.has(host) && !host.endsWith('google.com') && i > 0) {
      return current;
    }
    // Only follow short-link hosts; long google.com URLs usually already have coords.
    if (!SHORT_HOSTS.has(host) && i === 0) {
      return current;
    }
    try {
      const res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'SwimIT-PoolLocation/1.0',
        },
      });
      const loc = res.headers.get('location');
      if (loc) {
        current = new URL(loc, current).toString();
        continue;
      }
      // Some short links return HTML with a redirect meta/js URL.
      if (res.ok) {
        const html = await res.text();
        const meta = html.match(
          /content=["']0;\s*url=["']?([^"'>\s]+)["']?/i,
        );
        if (meta?.[1]) {
          current = new URL(meta[1], current).toString();
          continue;
        }
        const fromHtml = extractCoordsFromText(html);
        if (fromHtml) {
          return `https://www.google.com/maps?q=${fromHtml.lat},${fromHtml.lng}`;
        }
      }
      return current;
    } catch {
      return current;
    }
  }
  return current;
}

/**
 * Parse a Google Maps share link (or plain lat,lng) into coordinates.
 * Resolves short links like maps.app.goo.gl when needed.
 */
export async function parseGoogleMapsLocation(
  raw: string,
): Promise<
  | { ok: true; value: ParsedGoogleLocation }
  | { ok: false; error: string }
> {
  const input = String(raw ?? '').trim();
  if (!input) {
    return { ok: false, error: 'Paste the Google Maps link for the swimming pool' };
  }

  // Plain coordinates paste
  const plain = extractCoordsFromText(input);
  if (plain && !/^https?:\/\//i.test(input) && !input.includes('maps')) {
    return {
      ok: true,
      value: {
        latitude: plain.lat,
        longitude: plain.lng,
        googleMapsUrl: `https://www.google.com/maps?q=${plain.lat},${plain.lng}`,
      },
    };
  }

  let urlText = input;
  if (!/^https?:\/\//i.test(urlText)) {
    urlText = `https://${urlText}`;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlText);
  } catch {
    return {
      ok: false,
      error: 'Enter a valid Google Maps link (Share → Copy link on Google Maps)',
    };
  }

  const host = parsedUrl.hostname.toLowerCase();
  const looksLikeGoogle =
    host.includes('google.') ||
    host === 'maps.app.goo.gl' ||
    host === 'goo.gl' ||
    host === 'g.co';
  if (!looksLikeGoogle) {
    return {
      ok: false,
      error: 'Use a Google Maps link for the swimming pool location',
    };
  }

  let resolved = urlText;
  if (SHORT_HOSTS.has(host)) {
    resolved = await resolveRedirectUrl(urlText);
  }

  const coords =
    extractCoordsFromText(resolved) ||
    extractCoordsFromText(decodeURIComponent(resolved));
  if (!coords) {
    return {
      ok: false,
      error:
        'Could not read the location from that link. Open the pool in Google Maps, tap Share, then Copy link and paste it here.',
    };
  }

  return {
    ok: true,
    value: {
      latitude: coords.lat,
      longitude: coords.lng,
      googleMapsUrl: input.startsWith('http') ? input : urlText,
    },
  };
}
