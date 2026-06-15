/**
 * Analytics API helpers.
 * Dev: Vite proxies /api → http://127.0.0.1:8010/analytics
 * Prod / direct backend: set VITE_ANALYTICS_API_BASE=/analytics or use /api alias on the server
 */
// Detect an explicit Vite env override first (recommended for prod/dev deployments)
// `import.meta.env` is provided by Vite during bundling.
const envBase = (import.meta && import.meta.env && import.meta.env.VITE_ANALYTICS_API_BASE) || null;
const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
// If the frontend is served from the analytics domain, prefer same-origin API path so requests
// go to the backend attached to the current host. This avoids falling back to the hard-coded
// analyticsmain host when the site is hosted elsewhere.
const isAnalyticsHost = typeof window !== 'undefined' && window.location.hostname && window.location.hostname.endsWith('onestopanalytics.com');
const PRIMARY_BASE = envBase
  ? (envBase.endsWith('/api') ? envBase : `${envBase.replace(/\/$/, '')}/api`)
  : (isLocal ? '/analytics/api' : (isAnalyticsHost ? '/analytics/api' : 'https://analyticsmain.onestopanalytics.com/analytics/api'));
const FALLBACK_BASE = 'http://localhost:8010/analytics/api';

export function analyticsApiUrl(path, useFallback = false) {
  const segment = path.startsWith('/') ? path : `/${path}`;
  return `${useFallback ? FALLBACK_BASE : PRIMARY_BASE}${segment}`;
}

export async function analyticsFetchJson(path, options = {}) {
  const primaryUrl = analyticsApiUrl(path, false);
  const fallbackUrl = analyticsApiUrl(path, true);
  const isBrowser = typeof window !== 'undefined';
  const isSameOriginPrimary = isBrowser && new URL(primaryUrl, window.location.origin).origin === window.location.origin;
  const isLocalHost = isBrowser && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  let res;
  try {
    res = await fetch(primaryUrl, {
      headers: { Accept: 'application/json', ...options.headers },
      ...options,
    });
  } catch (err) {
    // If we're running locally or the primary URL is same-origin, falling back to localhost makes sense.
    if (isLocalHost || isSameOriginPrimary) {
      console.warn('Primary Analytics API failed, falling back to localhost...');
      res = await fetch(fallbackUrl, {
        headers: { Accept: 'application/json', ...options.headers },
        ...options,
      });
    } else {
      // Likely a CORS or cross-origin network error — surface a helpful message instead of silently retrying localhost.
      throw new Error(
        `Primary Analytics API request to ${primaryUrl} failed (likely CORS or cross-origin network error). ` +
        'If your frontend and analytics backend are on different domains, enable CORS on the analytics backend, ' +
        'or set `VITE_ANALYTICS_API_BASE` to a same-origin path so the browser does not make a cross-origin request.'
      );
    }
  }

  let wasLocal = res.url.includes('127.0.0.1') || res.url.includes('localhost');
  let contentType = res.headers.get('content-type') || '';

  // If primary returned an error (e.g. 404) or a non-JSON response (e.g. HTML), try the localhost fallback once
  // but only when it makes sense (we're local or the primary was same-origin).
  if (!wasLocal && (!res.ok || !contentType.includes('application/json'))) {
    if (isLocalHost || isSameOriginPrimary) {
      console.warn('Primary Analytics API returned error or non-JSON; retrying localhost fallback...');
      try {
        res = await fetch(fallbackUrl, {
          headers: { Accept: 'application/json', ...options.headers },
          ...options,
        });
        contentType = res.headers.get('content-type') || '';
      } catch (e) {
        // fall through to content-type check which will raise a helpful error
      }
    } else {
      const snippet = (await res.text()).slice(0, 80);
      throw new Error(
        res.ok
          ? 'Analytics API returned HTML instead of JSON. Is the analytics backend configured to return JSON and allow CORS?'
          : `Analytics API error (${res.status})${snippet ? `: ${snippet}` : ''}`
      );
    }
  }

  if (!contentType.includes('application/json')) {
    const snippet = (await res.text()).slice(0, 80);
    throw new Error(
      res.ok
        ? 'Analytics API returned HTML instead of JSON. Is the analytics backend running on port 8010?'
        : `Analytics API error (${res.status})${snippet ? `: ${snippet}` : ''}`
    );
  }

  const data = await res.json();
  if (!res.ok) {
    const detail = data?.detail ?? data?.message;
    throw new Error(
      typeof detail === 'string' ? detail : `Request failed (${res.status})`
    );
  }
  return data;
}
