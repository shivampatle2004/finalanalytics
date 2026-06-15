/**
 * storiesApi.js
 * Story Mode API client — wraps all /analytics/api/stories endpoints.
 */

const BASE = '/analytics/api/stories';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || `Request failed (${res.status})`);
  }
  // Export endpoints return binary
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/pdf') || ct.includes('presentationml')) {
    return res.blob();
  }
  return res.json();
}

// ── Stories ───────────────────────────────────────────────────────────────────

/** List all stories for a file. */
export const listStories = (fileId, userId) => {
  const params = new URLSearchParams();
  if (fileId) params.set('file_id', fileId);
  if (userId) params.set('user_id', userId);
  const qs = params.toString();
  return request(qs ? `?${qs}` : '');
};

/** Create a new story. */
export const createStory = (payload) =>
  request('', { method: 'POST', body: JSON.stringify(payload) });

/** Get a story with all points. */
export const getStory = (storyId) => request(`/${storyId}`);

/** Update story metadata. */
export const updateStory = (storyId, payload) =>
  request(`/${storyId}`, { method: 'PUT', body: JSON.stringify(payload) });

/** Delete a story. */
export const deleteStory = (storyId) =>
  request(`/${storyId}`, { method: 'DELETE' });

// ── Story Points ──────────────────────────────────────────────────────────────

/** Add a story point. */
export const addStoryPoint = (storyId, payload) =>
  request(`/${storyId}/points`, { method: 'POST', body: JSON.stringify(payload) });

/** Update a story point. */
export const updateStoryPoint = (storyId, pointId, payload) =>
  request(`/${storyId}/points/${pointId}`, { method: 'PUT', body: JSON.stringify(payload) });

/** Delete a story point. */
export const deleteStoryPoint = (storyId, pointId) =>
  request(`/${storyId}/points/${pointId}`, { method: 'DELETE' });

/** Reorder story points. */
export const reorderStoryPoints = (storyId, order) =>
  request(`/${storyId}/points/reorder`, { method: 'POST', body: JSON.stringify({ order }) });

/** Duplicate a story point. */
export const duplicateStoryPoint = (storyId, pointId) =>
  request(`/${storyId}/points/${pointId}/duplicate`, { method: 'POST' });

// ── Presentation & Export ─────────────────────────────────────────────────────

/** Get presentation-ready payload. */
export const getPresentationPayload = (storyId) => request(`/${storyId}/present`);

/** Export story as PDF — returns Blob. */
export const exportStoryPdf = (storyId, options = {}) =>
  request(`/${storyId}/export/pdf`, { method: 'POST', body: JSON.stringify(options) });

/** Export story as PPTX — returns Blob. */
export const exportStoryPptx = (storyId, options = {}) =>
  request(`/${storyId}/export/pptx`, { method: 'POST', body: JSON.stringify(options) });

/** Trigger a file download from a Blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
