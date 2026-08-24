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

export function saveCurrentUserProfile(payload) {
    return requestJson('/api/profile', {
        method: 'PUT',
        body: payload
    });
}

export async function uploadProfileAvatar(file) {
    const form = new FormData();
    form.append('file', file, file.name);

    const response = await fetch(`${getApiBaseUrl()}/api/profile/avatar`, {
        method: 'POST',
        credentials: 'same-origin',
        body: form
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
        const message = payload?.error?.message || `Upload failed: ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    return payload.data;
}

export function fetchUserProfile(userId) {
    return requestJson(`/api/users/${encodeURIComponent(userId)}`);
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

export function createComment(payload) {
    return requestJson('/api/comments', {
        method: 'POST',
        body: payload
    });
}

export function fetchCommentsByItem({ itemId, itemType = 'album', limit = 20, offset = 0 } = {}) {
    const query = new URLSearchParams({
        itemId,
        itemType,
        limit: String(limit),
        offset: String(offset)
    });

    return requestJson(`/api/comments?${query.toString()}`);
}

export function fetchMyComments({ limit = 20, offset = 0 } = {}) {
    const query = new URLSearchParams({
        limit: String(limit),
        offset: String(offset)
    });

    return requestJson(`/api/comments/me?${query.toString()}`);
}

export function deleteComment(commentId) {
    return requestJson(`/api/comments/${encodeURIComponent(commentId)}`, {
        method: 'DELETE'
    });
}

export function updateComment(commentId, payload) {
    return requestJson(`/api/comments/${encodeURIComponent(commentId)}`, {
        method: 'PUT',
        body: payload
    });
}

export function toggleCommentLike(commentId) {
    return requestJson(`/api/comments/${encodeURIComponent(commentId)}/like`, {
        method: 'POST'
    });
}