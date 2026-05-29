/**
 * Analytics API helpers.
 * Dev: Vite proxies /api → http://127.0.0.1:8010/analytics
 * Prod / direct backend: set VITE_ANALYTICS_API_BASE=/analytics or use /api alias on the server
 */
export function analyticsApiUrl(path) {
  const segment = path.startsWith('/') ? path : `/${path}`;
  // Use Vite proxy for analytics
  return `/analytics/api${segment}`;
}

export async function analyticsFetchJson(path, options = {}) {
  const res = await fetch(analyticsApiUrl(path), {
    headers: { Accept: 'application/json', ...options.headers },
    ...options,
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const snippet = (await res.text()).slice(0, 80);
    throw new Error(
      res.ok
        ? 'Analytics API returned HTML instead of JSON. Check the Vite proxy or backend status.'
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
