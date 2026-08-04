function getApiBaseUrl() {
    if (typeof window !== 'undefined' && window.location) {
        if (window.location.protocol === 'file:') {
            return 'http://localhost:3000';
        }

        return '';
    }

    return 'http://localhost:3000';
}

async function requestJson(path, { method = 'GET', body } = {}) {
    const headers = {
        Accept: 'application/json'
    };

    if (typeof body !== 'undefined') {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${getApiBaseUrl()}${path}`, {
        method,
        credentials: 'same-origin',
        headers,
        body: typeof body === 'undefined' ? undefined : JSON.stringify(body)
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
        const message = payload?.error?.message || `Request failed: ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        error.code = payload?.error?.code || 'REQUEST_FAILED';
        throw error;
    }

    return payload.data;
}

export function fetchCurrentUser() {
    return requestJson('/api/me');
}

export function beginGoogleLogin() {
    if (typeof window === 'undefined') {
        return;
    }

    window.location.assign(`${getApiBaseUrl()}/api/auth/google/start`);
}

export function logoutCurrentUser() {
    return requestJson('/api/auth/logout', {
        method: 'POST'
    });
}

export function saveRating(payload) {
    return requestJson('/api/ratings', {
        method: 'PUT',
        body: payload
    });
}

export function fetchMyRatings({ limit = 20, offset = 0 } = {}) {
    const query = new URLSearchParams({
        limit: String(limit),
        offset: String(offset)
    });

    return requestJson(`/api/ratings/me?${query.toString()}`);
}

export function fetchRatingsByItemIds(itemIds) {
    return requestJson('/api/ratings/me/by-items', {
        method: 'POST',
        body: { itemIds }
    });
}

export function deleteRatingByItemId(itemId) {
    return requestJson(`/api/ratings/${encodeURIComponent(itemId)}`, {
        method: 'DELETE'
    });
}