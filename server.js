import http from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import cors from 'cors';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createMusicComment,
    createSessionForUser,
    deleteMusicComment,
    deleteRating,
    deleteSession,
    findUserById,
    findUserBySessionId,
    getRatingsByItemIds,
    listMusicCommentsByItem,
    listMusicCommentsByUser,
    listRatingsByUser,
    toggleCommentLike,
    updateMusicComment,
    updateUserProfile,
    upsertUserFromAuthAccount,
    upsertRating
} from './ratings-db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFromFile() {
    const envPath = path.join(__dirname, '.env');

    if (!fsSync.existsSync(envPath)) {
        return;
    }

    const raw = fsSync.readFileSync(envPath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            return;
        }

        const equalIndex = trimmed.indexOf('=');
        if (equalIndex <= 0) {
            return;
        }

        const key = trimmed.slice(0, equalIndex).trim();
        const value = trimmed.slice(equalIndex + 1).trim();
        const normalizedValue = value.length >= 2
            && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
            ? value.slice(1, -1)
            : value;

        if (!process.env[key]) {
            process.env[key] = normalizedValue;
        }
    });
}

loadEnvFromFile();

const PORT = Number(process.env.PORT) || 3000;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-session-secret-change-me';
const SESSION_COOKIE_NAME = 'music_rate_session';
const GOOGLE_STATE_COOKIE_NAME = 'music_rate_google_state';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_SEARCH_URL = 'https://api.spotify.com/v1/search';
const SPOTIFY_ALBUMS_URL = 'https://api.spotify.com/v1/albums';
const MAX_PROFILE_NAME_LENGTH = 40;
const MAX_FEATURED_MUSIC_COUNT = 3;
const MAX_PROFILE_AVATAR_BYTES = 5 * 1024 * 1024;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || '';
const CLOUDINARY_UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || '';
const CLOUDINARY_UPLOAD_URL = CLOUDINARY_CLOUD_NAME
    ? `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`
    : '';

let cachedAccessToken = '';
let accessTokenExpiresAt = 0;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon'
};

const corsMiddleware = cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-User-Id']
});

function applyCors(req, res) {
    return new Promise((resolve, reject) => {
        corsMiddleware(req, res, (error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

function sendJson(res, statusCode, body) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(body));
}

function sendRedirect(res, location) {
    res.writeHead(302, {
        Location: location,
        'Cache-Control': 'no-store'
    });
    res.end();
}

function sendOk(res, statusCode, data) {
    sendJson(res, statusCode, typeof data === 'undefined' ? { ok: true } : { ok: true, data });
}

function sendError(res, statusCode, code, message) {
    sendJson(res, statusCode, {
        ok: false,
        error: {
            code,
            message
        }
    });
}

function getUserId(req) {
    const headerValue = req.headers['x-user-id'];
    if (Array.isArray(headerValue)) {
        return headerValue[0]?.trim() || '';
    }

    return (headerValue || '').trim();
}

function getCookieOptions(req, maxAgeSeconds) {
    const forwardedProto = req.headers['x-forwarded-proto'];
    const isSecure = req.socket.encrypted || forwardedProto === 'https';
    const options = [
        'Path=/',
        'HttpOnly',
        'SameSite=Lax'
    ];

    if (typeof maxAgeSeconds === 'number') {
        options.push(`Max-Age=${Math.max(Math.floor(maxAgeSeconds), 0)}`);
    }

    if (isSecure) {
        options.push('Secure');
    }

    return options.join('; ');
}

function setCookie(req, res, name, value, maxAgeSeconds) {
    const serializedCookie = `${name}=${value}; ${getCookieOptions(req, maxAgeSeconds)}`;
    const existingCookieHeader = res.getHeader('Set-Cookie');
    const cookies = Array.isArray(existingCookieHeader)
        ? [...existingCookieHeader, serializedCookie]
        : existingCookieHeader
            ? [existingCookieHeader, serializedCookie]
            : [serializedCookie];

    res.setHeader('Set-Cookie', cookies);
}

function clearCookie(req, res, name) {
    setCookie(req, res, name, '', 0);
}

function parseCookies(req) {
    const cookieHeader = req.headers.cookie || '';
    return cookieHeader.split(';').reduce((cookies, pair) => {
        const [rawName, ...rawValueParts] = pair.split('=');
        const name = rawName?.trim();
        if (!name) {
            return cookies;
        }

        cookies[name] = decodeURIComponent(rawValueParts.join('=').trim());
        return cookies;
    }, {});
}

function createSignedState(state) {
    return createHmac('sha256', SESSION_SECRET).update(state).digest('hex');
}

function getAppOrigin(req) {
    const host = req.headers.host || `localhost:${PORT}`;
    const forwardedProto = req.headers['x-forwarded-proto'];
    const protocol = req.socket.encrypted || forwardedProto === 'https' ? 'https' : 'http';
    return `${protocol}://${host}`;
}

function buildAppRedirectUrl(req, hash = 'mypage', params = {}) {
    const url = new URL('/', getAppOrigin(req));
    Object.entries(params).forEach(([key, value]) => {
        if (typeof value === 'string' && value) {
            url.searchParams.set(key, value);
        }
    });
    url.hash = hash;
    return url.toString();
}

function redirectToAppWithAuthMessage(req, res, code, message) {
    sendRedirect(res, buildAppRedirectUrl(req, 'mypage', {
        authError: code,
        authMessage: message
    }));
}

function getGoogleRedirectUri(req) {
    return GOOGLE_REDIRECT_URI || `${getAppOrigin(req)}/api/auth/google/callback`;
}

function getAuthenticatedSession(req) {
    const sessionId = parseCookies(req)[SESSION_COOKIE_NAME] || '';
    return findUserBySessionId(sessionId);
}

function requireAuthenticatedUser(req, res) {
    const session = getAuthenticatedSession(req);
    if (!session?.user?.id) {
        sendError(res, 401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
        return null;
    }

    return session.user;
}

function validateGoogleCredentials() {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        throw new Error('서버 환경변수 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET이 필요합니다.');
    }
}

function validateRatingValue(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return false;
    }

    if (parsed < 0.5 || parsed > 5) {
        return false;
    }

    return Number.isInteger(parsed * 2);
}

function validateItemType(value) {
    return value === 'song' || value === 'album';
}

function validateCommentVisibility(value) {
    return value === 'public' || value === 'private';
}

function validateProfileDisplayName(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= MAX_PROFILE_NAME_LENGTH;
}

function validateProfileAvatarUrl(value) {
    if (value == null || value === '') {
        return true;
    }

    if (typeof value !== 'string') {
        return false;
    }

    const normalizedValue = value.trim();
    if (!normalizedValue) {
        return false;
    }

    try {
        const parsedUrl = new URL(normalizedValue);
        return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
        return false;
    }
}

function normalizeFeaturedMusic(items) {
    if (!Array.isArray(items)) {
        return [];
    }

    const normalizedItems = [];
    const usedItemIds = new Set();

    items.forEach((item) => {
        if (!item || typeof item !== 'object' || normalizedItems.length >= MAX_FEATURED_MUSIC_COUNT) {
            return;
        }

        const itemId = (item.itemId || '').toString().trim();
        const itemType = (item.itemType || '').toString().trim();
        const title = (item.title || '').toString().trim();
        const artist = item.artist == null ? '' : item.artist.toString().trim();
        const image = item.image == null ? '' : item.image.toString().trim();
        const year = item.year == null ? '' : item.year.toString().trim();

        if (!itemId || usedItemIds.has(itemId)) {
            return;
        }

        if (itemType !== 'song' && itemType !== 'album') {
            return;
        }

        if (!title || title.length > 140 || artist.length > 140 || year.length > 20) {
            return;
        }

        if (image && !validateProfileAvatarUrl(image) && !image.startsWith('data:image/')) {
            return;
        }

        normalizedItems.push({
            itemId,
            itemType,
            title,
            artist,
            image,
            year
        });
        usedItemIds.add(itemId);
    });

    return normalizedItems;
}

async function readMultipartFile(req) {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=([^;]+)/);
    if (!boundaryMatch) {
        throw new Error('multipart boundary not found');
    }

    const boundary = boundaryMatch[1].trim();
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }

    const raw = Buffer.concat(chunks);
    if (raw.length > MAX_PROFILE_AVATAR_BYTES) {
        throw new Error('파일 크기가 5MB를 초과합니다.');
    }

    const delimiter = Buffer.from(`\r\n--${boundary}`);
    const parts = [];
    let start = raw.indexOf(`--${boundary}`) + `--${boundary}`.length;

    while (start < raw.length) {
        const end = raw.indexOf(delimiter, start);
        const partEnd = end === -1 ? raw.length : end;
        const part = raw.slice(start, partEnd);
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) {
            break;
        }

        const headerText = part.slice(0, headerEnd).toString();
        const data = part.slice(headerEnd + 4);
        parts.push({ headerText, data });

        if (end === -1) {
            break;
        }

        start = end + delimiter.length;
    }

    for (const { headerText, data } of parts) {
        const nameMatch = headerText.match(/name="([^"]+)"/);
        const filenameMatch = headerText.match(/filename="([^"]+)"/);
        const contentTypeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/);

        if (nameMatch?.[1] === 'file' && filenameMatch) {
            return {
                filename: filenameMatch[1],
                mimeType: (contentTypeMatch?.[1] || 'application/octet-stream').trim(),
                data
            };
        }
    }

    throw new Error('파일 필드를 찾을 수 없습니다.');
}

async function readJsonBody(req) {
    const chunks = [];

    for await (const chunk of req) {
        chunks.push(chunk);
    }

    if (!chunks.length) {
        return null;
    }

    const rawBody = Buffer.concat(chunks).toString('utf8').trim();
    if (!rawBody) {
        return null;
    }

    return JSON.parse(rawBody);
}

function getSafeFilePath(urlPathname) {
    const normalizedPath = urlPathname === '/' ? '/index.html' : urlPathname;
    const decodedPath = decodeURIComponent(normalizedPath);
    const resolvedPath = path.join(__dirname, decodedPath);

    if (!resolvedPath.startsWith(__dirname)) {
        return null;
    }

    return resolvedPath;
}

async function serveStaticFile(req, res, urlPathname) {
    const safeFilePath = getSafeFilePath(urlPathname);
    if (!safeFilePath) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    try {
        const fileBuffer = await fs.readFile(safeFilePath);
        const ext = path.extname(safeFilePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(fileBuffer);
    } catch {
        res.writeHead(404);
        res.end('Not Found');
    }
}

function validateSpotifyCredentials() {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
        throw new Error('서버 환경변수 SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET이 필요합니다.');
    }
}

async function getSpotifyAccessToken() {
    const now = Date.now();
    if (cachedAccessToken && now < accessTokenExpiresAt - 10_000) {
        return cachedAccessToken;
    }

    validateSpotifyCredentials();

    const encodedAuth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const tokenBody = new URLSearchParams({ grant_type: 'client_credentials' });

    const response = await fetch(SPOTIFY_TOKEN_URL, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${encodedAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: tokenBody
    });

    if (!response.ok) {
        throw new Error(`Spotify 토큰 발급 실패: ${response.status}`);
    }

    const payload = await response.json();
    cachedAccessToken = payload.access_token || '';
    accessTokenExpiresAt = now + (Number(payload.expires_in) || 3600) * 1000;

    if (!cachedAccessToken) {
        throw new Error('Spotify 토큰 응답이 비어 있습니다.');
    }

    return cachedAccessToken;
}

function normalizeSpotifyEntity(entity) {
    return entity === 'album' ? 'album' : 'track';
}

function chunkArray(items, size) {
    const chunks = [];

    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }

    return chunks;
}

async function enrichAlbumPopularity(payload, accessToken) {
    return enrichItemPopularity({
        payload,
        collectionKey: 'albums',
        detailUrl: SPOTIFY_ALBUMS_URL,
        detailArrayKey: 'albums',
        accessToken
    });
}

async function enrichItemPopularity({ payload, collectionKey, detailUrl, detailArrayKey, accessToken }) {
    const items = Array.isArray(payload?.[collectionKey]?.items) ? payload[collectionKey].items : [];
    if (!items.length) {
        return payload;
    }

    const itemIds = items.map((item) => item?.id).filter(Boolean);
    if (!itemIds.length) {
        return payload;
    }

    const popularityById = new Map();
    const itemIdChunks = chunkArray(itemIds, 20);
    const detailItemsByChunk = await Promise.all(itemIdChunks.map(async (idChunk) => {
        try {
            const query = new URLSearchParams({ ids: idChunk.join(',') });
            const response = await fetch(`${detailUrl}?${query.toString()}`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            if (!response.ok) {
                return [];
            }

            const detailPayload = await response.json();
            return Array.isArray(detailPayload?.[detailArrayKey]) ? detailPayload[detailArrayKey] : [];
        } catch {
            // 상세 조회 실패 시 검색 결과는 그대로 유지합니다.
            return [];
        }
    }));

    detailItemsByChunk.flat().forEach((item) => {
        if (!item?.id) {
            return;
        }

        const popularity = Number(item.popularity);
        if (Number.isFinite(popularity)) {
            popularityById.set(item.id, Math.floor(Math.min(Math.max(popularity, 0), 100)));
        }
    });

    const enrichedItems = items.map((item) => {
        const existingPopularity = Number(item?.popularity);
        const normalizedExistingPopularity = Number.isFinite(existingPopularity)
            ? Math.floor(Math.min(Math.max(existingPopularity, 0), 100))
            : 0;

        return {
            ...item,
            popularity: popularityById.get(item?.id) ?? normalizedExistingPopularity
        };
    });

    return {
        ...payload,
        [collectionKey]: {
            ...payload[collectionKey],
            items: enrichedItems
        }
    };
}

async function handleSpotifySearchApi(req, res, requestUrl) {
    if (req.method !== 'GET') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    const term = (requestUrl.searchParams.get('term') || '').trim();
    const limitParam = Number(requestUrl.searchParams.get('limit') || '10');
    const offsetParam = Number(requestUrl.searchParams.get('offset') || '0');
    const entity = normalizeSpotifyEntity(requestUrl.searchParams.get('entity') || 'song');

    if (!term) {
        sendError(res, 400, 'MISSING_TERM', 'term 파라미터가 필요합니다.');
        return;
    }

    const limit = Number.isFinite(limitParam) ? Math.floor(Math.min(Math.max(limitParam, 1), 50)) : 10;
    const offset = Number.isFinite(offsetParam) ? Math.floor(Math.max(offsetParam, 0)) : 0;

    try {
        const accessToken = await getSpotifyAccessToken();
        const spotifyQuery = new URLSearchParams({
            q: term,
            type: entity,
            market: 'KR',
            limit: String(limit),
            offset: String(offset)
        });


        const spotifyResponse = await fetch(`${SPOTIFY_SEARCH_URL}?${spotifyQuery.toString()}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });    

        if (!spotifyResponse.ok) {
            throw new Error(`Spotify API 요청 실패: ${spotifyResponse.status}`);
        }

        const payload = await spotifyResponse.json();
        let responsePayload = payload;
        if (entity === 'album') {
            responsePayload = await enrichAlbumPopularity(payload, accessToken);
        }

        sendJson(res, 200, responsePayload);
    } catch (error) {
        sendError(res, 500, 'SPOTIFY_SEARCH_FAILED', error instanceof Error ? error.message : 'Spotify 검색 중 오류가 발생했습니다.');
    }
}

async function handleGoogleAuthStart(req, res) {
    if (req.method !== 'GET') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    try {
        validateGoogleCredentials();
        const state = randomBytes(24).toString('hex');
        const stateValue = `${state}.${createSignedState(state)}`;
        setCookie(req, res, GOOGLE_STATE_COOKIE_NAME, encodeURIComponent(stateValue), 60 * 10);

        const authQuery = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            redirect_uri: getGoogleRedirectUri(req),
            response_type: 'code',
            scope: 'openid email profile',
            access_type: 'offline',
            include_granted_scopes: 'true',
            prompt: 'consent',
            state
        });

        sendRedirect(res, `${GOOGLE_AUTH_URL}?${authQuery.toString()}`);
    } catch (error) {
        redirectToAppWithAuthMessage(
            req,
            res,
            'GOOGLE_AUTH_CONFIG_ERROR',
            error instanceof Error ? error.message : 'Google 로그인 설정 중 오류가 발생했습니다.'
        );
    }
}

async function handleGoogleAuthCallback(req, res, requestUrl) {
    if (req.method !== 'GET') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    const code = (requestUrl.searchParams.get('code') || '').trim();
    const state = (requestUrl.searchParams.get('state') || '').trim();
    const errorCode = (requestUrl.searchParams.get('error') || '').trim();
    const storedStateValue = parseCookies(req)[GOOGLE_STATE_COOKIE_NAME] || '';

    if (errorCode) {
        clearCookie(req, res, GOOGLE_STATE_COOKIE_NAME);
        redirectToAppWithAuthMessage(req, res, 'GOOGLE_AUTH_DENIED', 'Google 로그인이 취소되었거나 거부되었습니다.');
        return;
    }

    if (!code || !state || !storedStateValue) {
        redirectToAppWithAuthMessage(req, res, 'INVALID_GOOGLE_CALLBACK', 'Google 로그인 응답이 올바르지 않습니다.');
        return;
    }

    const decodedStateValue = decodeURIComponent(storedStateValue);
    const [storedState, storedSignature] = decodedStateValue.split('.');
    if (storedState !== state || storedSignature !== createSignedState(state)) {
        clearCookie(req, res, GOOGLE_STATE_COOKIE_NAME);
        redirectToAppWithAuthMessage(req, res, 'INVALID_GOOGLE_STATE', 'Google 로그인 상태 검증에 실패했습니다.');
        return;
    }

    try {
        validateGoogleCredentials();

        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: getGoogleRedirectUri(req),
                grant_type: 'authorization_code'
            })
        });

        if (!tokenResponse.ok) {
            throw new Error(`Google 토큰 교환 실패: ${tokenResponse.status}`);
        }

        const tokenPayload = await tokenResponse.json();
        const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
            headers: {
                Authorization: `Bearer ${tokenPayload.access_token || ''}`
            }
        });

        if (!userInfoResponse.ok) {
            throw new Error(`Google 사용자 조회 실패: ${userInfoResponse.status}`);
        }

        const userInfo = await userInfoResponse.json();
        const tokenExpiresAt = Number.isFinite(Number(tokenPayload.expires_in))
            ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000).toISOString()
            : null;
        const user = upsertUserFromAuthAccount({
            provider: 'google',
            providerUserId: userInfo.sub || '',
            email: userInfo.email || null,
            displayName: userInfo.name || null,
            avatarUrl: userInfo.picture || null,
            accessToken: tokenPayload.access_token || null,
            refreshToken: tokenPayload.refresh_token || null,
            scope: tokenPayload.scope || null,
            tokenExpiresAt
        });

        const session = createSessionForUser(
            user.id,
            new Date(Date.now() + SESSION_TTL_MS).toISOString()
        );

        clearCookie(req, res, GOOGLE_STATE_COOKIE_NAME);
        setCookie(req, res, SESSION_COOKIE_NAME, encodeURIComponent(session.sessionId), SESSION_TTL_MS / 1000);
        sendRedirect(res, buildAppRedirectUrl(req, 'mypage'));
    } catch (error) {
        clearCookie(req, res, GOOGLE_STATE_COOKIE_NAME);
        redirectToAppWithAuthMessage(
            req,
            res,
            'GOOGLE_LOGIN_FAILED',
            error instanceof Error ? error.message : 'Google 로그인 처리 중 오류가 발생했습니다.'
        );
    }
}

async function handleCurrentUserApi(req, res) {
    if (req.method !== 'GET') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    const session = getAuthenticatedSession(req);
    sendOk(res, 200, {
        authenticated: Boolean(session?.user?.id),
        user: session?.user || null
    });
}

async function handleLogoutApi(req, res) {
    if (req.method !== 'POST') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    const sessionId = parseCookies(req)[SESSION_COOKIE_NAME] || '';
    if (sessionId) {
        deleteSession(sessionId);
    }

    clearCookie(req, res, SESSION_COOKIE_NAME);
    sendOk(res, 200);
}

async function handleUpdateMyProfileApi(req, res) {
    if (req.method !== 'PUT') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    const user = requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    let body;
    try {
        body = await readJsonBody(req);
    } catch {
        sendError(res, 400, 'INVALID_JSON', 'request body must be valid JSON');
        return;
    }

    const displayName = (body?.displayName || '').toString();
    const avatarUrl = body?.avatarUrl == null ? '' : body.avatarUrl.toString();
    const featuredMusic = typeof body?.featuredMusic === 'undefined'
        ? null
        : normalizeFeaturedMusic(body?.featuredMusic);

    if (!validateProfileDisplayName(displayName)) {
        sendError(res, 400, 'INVALID_DISPLAY_NAME', 'displayName must be between 1 and 40 characters.');
        return;
    }

    if (!validateProfileAvatarUrl(avatarUrl)) {
        sendError(res, 400, 'INVALID_AVATAR_URL', 'avatarUrl must be an http/https URL or data:image payload under 2MB.');
        return;
    }

    try {
        const updatedUser = updateUserProfile({
            userId: user.id,
            displayName,
            avatarUrl,
            featuredMusic
        });
        sendOk(res, 200, updatedUser);
    } catch (error) {
        sendError(res, 500, 'UPDATE_PROFILE_FAILED', error instanceof Error ? error.message : '프로필 저장 중 오류가 발생했습니다.');
    }
}

async function handleUploadAvatarApi(req, res) {
    if (req.method !== 'POST') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    const user = requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
        sendError(res, 503, 'CLOUDINARY_NOT_CONFIGURED', 'Cloudinary 환경변수가 설정되지 않았습니다.');
        return;
    }

    let file;
    try {
        file = await readMultipartFile(req);
    } catch (error) {
        sendError(res, 400, 'INVALID_FILE', error instanceof Error ? error.message : '파일을 읽지 못했습니다.');
        return;
    }

    if (!file.mimeType.startsWith('image/')) {
        sendError(res, 400, 'INVALID_FILE_TYPE', '이미지 파일만 업로드할 수 있습니다.');
        return;
    }

    try {
        // public_id는 사용자 ID 기반으로 고정해 업로드마다 덮어쓰도록 합니다.
        const publicId = `musicrate/avatars/${user.id}`;

        const form = new FormData();
        form.append('file', new Blob([file.data], { type: file.mimeType }), file.filename);
        form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        form.append('public_id', publicId);

        const uploadResponse = await fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: form });
        const uploadPayload = await uploadResponse.json();

        if (!uploadResponse.ok) {
            throw new Error(uploadPayload?.error?.message || `Cloudinary 업로드 실패: ${uploadResponse.status}`);
        }

        const secureUrl = uploadPayload.secure_url;
        sendOk(res, 200, { avatarUrl: secureUrl });
    } catch (error) {
        sendError(res, 500, 'UPLOAD_FAILED', error instanceof Error ? error.message : '이미지 업로드 중 오류가 발생했습니다.');
    }
}

async function handleGetPublicUserProfileApi(req, res, userId) {
    if (req.method !== 'GET') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    if (!userId) {
        sendError(res, 400, 'INVALID_USER_ID', 'userId is required');
        return;
    }

    try {
        const user = findUserById(userId);
        if (!user) {
            sendError(res, 404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
            return;
        }

        sendOk(res, 200, {
            id: user.id,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            featuredMusic: Array.isArray(user.featuredMusic) ? user.featuredMusic : [],
            bio: user.bio,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        });
    } catch (error) {
        sendError(res, 500, 'GET_USER_FAILED', error instanceof Error ? error.message : '사용자 조회 중 오류가 발생했습니다.');
    }
}

async function handleCreateCommentApi(req, res) {
    if (req.method !== 'POST') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    const user = requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    let body;
    try {
        body = await readJsonBody(req);
    } catch {
        sendError(res, 400, 'INVALID_JSON', 'request body must be valid JSON');
        return;
    }

    const itemId = (body?.itemId || '').toString().trim();
    const itemType = (body?.itemType || '').toString().trim();
    const title = (body?.title || '').toString().trim();
    const artist = body?.artist == null ? null : body.artist.toString().trim() || null;
    const image = body?.image == null ? null : body.image.toString().trim() || null;
    const year = body?.year == null ? null : body.year.toString().trim() || null;
    const content = (body?.content || '').toString();
    const visibility = ((body?.visibility || 'public').toString().trim().toLowerCase() || 'public');

    if (!itemId) {
        sendError(res, 400, 'INVALID_ITEM_ID', 'itemId is required');
        return;
    }

    if (!validateItemType(itemType)) {
        sendError(res, 400, 'INVALID_ITEM_TYPE', 'itemType must be song or album');
        return;
    }

    if (!title) {
        sendError(res, 400, 'INVALID_TITLE', 'title is required');
        return;
    }

    if (!content.trim() || content.length > 2000) {
        sendError(res, 400, 'INVALID_CONTENT', 'content must be between 1 and 2000 characters');
        return;
    }

    if (!validateCommentVisibility(visibility)) {
        sendError(res, 400, 'INVALID_VISIBILITY', 'visibility must be public or private');
        return;
    }

    try {
        const comment = createMusicComment({
            userId: user.id,
            itemId,
            itemType,
            title,
            artist,
            image,
            year,
            content: content.trim(),
            visibility
        });
        sendOk(res, 200, comment);
    } catch (error) {
        if (error instanceof Error && error.message === 'comment already exists for this item') {
            sendError(res, 409, 'COMMENT_ALREADY_EXISTS', '이 음악/앨범에는 이미 코멘트를 작성했습니다.');
            return;
        }
        sendError(res, 500, 'CREATE_COMMENT_FAILED', error instanceof Error ? error.message : '댓글 저장 중 오류가 발생했습니다.');
    }
}

async function handleListCommentsByItemApi(req, res, requestUrl) {
    if (req.method !== 'GET') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    const itemId = (requestUrl.searchParams.get('itemId') || '').toString().trim();
    const itemType = (requestUrl.searchParams.get('itemType') || 'album').toString().trim();

    if (!itemId) {
        sendError(res, 400, 'INVALID_ITEM_ID', 'itemId is required');
        return;
    }

    if (!validateItemType(itemType)) {
        sendError(res, 400, 'INVALID_ITEM_TYPE', 'itemType must be song or album');
        return;
    }

    const limitParam = Number(requestUrl.searchParams.get('limit') || '20');
    const offsetParam = Number(requestUrl.searchParams.get('offset') || '0');
    const limit = Number.isFinite(limitParam) ? Math.floor(Math.min(Math.max(limitParam, 1), 100)) : 20;
    const offset = Number.isFinite(offsetParam) ? Math.floor(Math.max(offsetParam, 0)) : 0;
    const viewerUserId = getAuthenticatedSession(req)?.user?.id || null;

    try {
        const data = listMusicCommentsByItem({ itemId, itemType, limit, offset, viewerUserId });
        sendOk(res, 200, data);
    } catch (error) {
        sendError(res, 500, 'LIST_COMMENTS_FAILED', error instanceof Error ? error.message : '댓글 목록 조회 중 오류가 발생했습니다.');
    }
}

async function handleListMyCommentsApi(req, res, requestUrl) {
    if (req.method !== 'GET') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    const user = requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    const limitParam = Number(requestUrl.searchParams.get('limit') || '20');
    const offsetParam = Number(requestUrl.searchParams.get('offset') || '0');
    const limit = Number.isFinite(limitParam) ? Math.floor(Math.min(Math.max(limitParam, 1), 100)) : 20;
    const offset = Number.isFinite(offsetParam) ? Math.floor(Math.max(offsetParam, 0)) : 0;

    try {
        const data = listMusicCommentsByUser({ userId: user.id, limit, offset, viewerUserId: user.id });
        sendOk(res, 200, data);
    } catch (error) {
        sendError(res, 500, 'LIST_MY_COMMENTS_FAILED', error instanceof Error ? error.message : '내 댓글 목록 조회 중 오류가 발생했습니다.');
    }
}

async function handleUpdateCommentApi(req, res, commentId) {
    if (req.method !== 'PUT') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    const user = requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    let body;
    try {
        body = await readJsonBody(req);
    } catch {
        sendError(res, 400, 'INVALID_JSON', 'request body must be valid JSON');
        return;
    }

    const content = (body?.content || '').toString();
    if (!content.trim() || content.trim().length > 2000) {
        sendError(res, 400, 'INVALID_CONTENT', 'content must be between 1 and 2000 characters');
        return;
    }

    try {
        const updatedComment = updateMusicComment({ userId: user.id, commentId, content: content.trim() });
        sendOk(res, 200, updatedComment);
    } catch (error) {
        sendError(res, 500, 'UPDATE_COMMENT_FAILED', error instanceof Error ? error.message : '댓글 수정 중 오류가 발생했습니다.');
    }
}

async function handleToggleCommentLikeApi(req, res, commentId) {
    if (req.method !== 'POST') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    const user = requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    if (!commentId) {
        sendError(res, 400, 'INVALID_COMMENT_ID', 'commentId is required');
        return;
    }

    try {
        const result = toggleCommentLike({ userId: user.id, commentId });
        sendOk(res, 200, result);
    } catch (error) {
        sendError(res, 500, 'TOGGLE_COMMENT_LIKE_FAILED', error instanceof Error ? error.message : '좋아요 처리 중 오류가 발생했습니다.');
    }
}

async function handleDeleteCommentApi(req, res, commentId) {
    if (req.method !== 'DELETE') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    const user = requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    if (!commentId) {
        sendError(res, 400, 'INVALID_COMMENT_ID', 'commentId is required');
        return;
    }

    try {
        const deleted = deleteMusicComment({ userId: user.id, commentId });
        sendOk(res, 200, { deleted });
    } catch (error) {
        sendError(res, 500, 'DELETE_COMMENT_FAILED', error instanceof Error ? error.message : '댓글 삭제 중 오류가 발생했습니다.');
    }
}

async function handlePutRatingApi(req, res) {
    if (req.method !== 'PUT') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    const user = requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    let body;
    try {
        body = await readJsonBody(req);
    } catch {
        sendError(res, 400, 'INVALID_JSON', 'request body must be valid JSON');
        return;
    }

    const itemId = (body?.itemId || '').toString().trim();
    const itemType = (body?.itemType || '').toString().trim();
    const title = (body?.title || '').toString().trim();
    const artist = body?.artist ? body.artist.toString().trim() : null;
    const image = body?.image ? body.image.toString().trim() : null;
    const year = body?.year ? body.year.toString().trim() : null;
    const rating = Number(body?.rating);

    if (!itemId) {
        sendError(res, 400, 'INVALID_ITEM_ID', 'itemId is required');
        return;
    }

    if (!validateItemType(itemType)) {
        sendError(res, 400, 'INVALID_ITEM_TYPE', 'itemType must be song or album');
        return;
    }

    if (!title) {
        sendError(res, 400, 'INVALID_TITLE', 'title is required');
        return;
    }

    if (!validateRatingValue(rating)) {
        sendError(res, 400, 'INVALID_RATING', 'rating must be between 0.5 and 5.0 in 0.5 steps');
        return;
    }

    try {
        const savedRating = upsertRating({
            userId: user.id,
            itemId,
            itemType,
            title,
            artist,
            image,
            year,
            rating
        });
        sendOk(res, 200, savedRating);
    } catch (error) {
        sendError(res, 500, 'SAVE_RATING_FAILED', error instanceof Error ? error.message : '평점 저장 중 오류가 발생했습니다.');
    }
}

async function handleGetMyRatingsApi(req, res, requestUrl) {
    if (req.method !== 'GET') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    const user = requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    const limitParam = Number(requestUrl.searchParams.get('limit') || '20');
    const offsetParam = Number(requestUrl.searchParams.get('offset') || '0');
    const limit = Number.isFinite(limitParam) ? Math.floor(Math.min(Math.max(limitParam, 1), 100)) : 20;
    const offset = Number.isFinite(offsetParam) ? Math.floor(Math.max(offsetParam, 0)) : 0;

    try {
        const data = listRatingsByUser({ userId: user.id, limit, offset });
        sendOk(res, 200, data);
    } catch (error) {
        sendError(res, 500, 'LIST_RATINGS_FAILED', error instanceof Error ? error.message : '평점 목록 조회 중 오류가 발생했습니다.');
    }
}

async function handlePostRatingsByItemsApi(req, res) {
    if (req.method !== 'POST') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    const user = requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    let body;
    try {
        body = await readJsonBody(req);
    } catch {
        sendError(res, 400, 'INVALID_JSON', 'request body must be valid JSON');
        return;
    }

    const rawItemIds = Array.isArray(body?.itemIds) ? body.itemIds : null;
    if (!rawItemIds) {
        sendError(res, 400, 'INVALID_ITEM_IDS', 'itemIds must be an array');
        return;
    }

    const itemIds = rawItemIds
        .map((itemId) => (itemId || '').toString().trim())
        .filter(Boolean)
        .slice(0, 200);

    try {
        const ratingsByItemId = getRatingsByItemIds({ userId: user.id, itemIds });
        sendOk(res, 200, { ratingsByItemId });
    } catch (error) {
        sendError(res, 500, 'GET_RATINGS_BY_ITEMS_FAILED', error instanceof Error ? error.message : '평점 조회 중 오류가 발생했습니다.');
    }
}

async function handleDeleteRatingApi(req, res, itemId) {
    if (req.method !== 'DELETE') {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    const user = requireAuthenticatedUser(req, res);
    if (!user) {
        return;
    }

    if (!itemId) {
        sendError(res, 400, 'INVALID_ITEM_ID', 'itemId is required');
        return;
    }

    try {
        deleteRating({ userId: user.id, itemId });
        sendOk(res, 200);
    } catch (error) {
        sendError(res, 500, 'DELETE_RATING_FAILED', error instanceof Error ? error.message : '평점 삭제 중 오류가 발생했습니다.');
    }
}

const server = http.createServer(async (req, res) => {
    try {
        await applyCors(req, res);
    } catch {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('CORS middleware failed');
        return;
    }

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || `localhost:${PORT}`}`);

    if (requestUrl.pathname === '/api/spotify/search') {
        await handleSpotifySearchApi(req, res, requestUrl);
        return;
    }

    if (requestUrl.pathname === '/api/auth/google/start') {
        await handleGoogleAuthStart(req, res);
        return;
    }

    if (requestUrl.pathname === '/api/auth/google/callback') {
        await handleGoogleAuthCallback(req, res, requestUrl);
        return;
    }

    if (requestUrl.pathname === '/api/me') {
        await handleCurrentUserApi(req, res);
        return;
    }

    if (requestUrl.pathname === '/api/auth/logout') {
        await handleLogoutApi(req, res);
        return;
    }

    if (requestUrl.pathname === '/api/profile') {
        await handleUpdateMyProfileApi(req, res);
        return;
    }

    if (requestUrl.pathname === '/api/profile/avatar') {
        await handleUploadAvatarApi(req, res);
        return;
    }

    if (requestUrl.pathname === '/api/comments') {
        if (req.method === 'GET') {
            await handleListCommentsByItemApi(req, res, requestUrl);
            return;
        }

        if (req.method === 'POST') {
            await handleCreateCommentApi(req, res);
            return;
        }

        sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method Not Allowed');
        return;
    }

    if (requestUrl.pathname === '/api/comments/me') {
        await handleListMyCommentsApi(req, res, requestUrl);
        return;
    }

    if (requestUrl.pathname.startsWith('/api/comments/')) {
        const remainingPath = decodeURIComponent(requestUrl.pathname.slice('/api/comments/'.length));

        if (remainingPath.endsWith('/like')) {
            const commentId = remainingPath.slice(0, -'/like'.length);
            await handleToggleCommentLikeApi(req, res, commentId);
            return;
        }

        const commentId = remainingPath;
        if (req.method === 'PUT') {
            await handleUpdateCommentApi(req, res, commentId);
            return;
        }

        await handleDeleteCommentApi(req, res, commentId);
        return;
    }

    if (requestUrl.pathname === '/api/ratings') {
        await handlePutRatingApi(req, res);
        return;
    }

    if (requestUrl.pathname === '/api/ratings/me') {
        await handleGetMyRatingsApi(req, res, requestUrl);
        return;
    }

    if (requestUrl.pathname === '/api/ratings/me/by-items') {
        await handlePostRatingsByItemsApi(req, res);
        return;
    }

    if (requestUrl.pathname.startsWith('/api/ratings/')) {
        const itemId = decodeURIComponent(requestUrl.pathname.slice('/api/ratings/'.length));
        await handleDeleteRatingApi(req, res, itemId);
        return;
    }

    if (requestUrl.pathname.startsWith('/api/users/')) {
        const userId = decodeURIComponent(requestUrl.pathname.slice('/api/users/'.length));
        await handleGetPublicUserProfileApi(req, res, userId);
        return;
    }

    await serveStaticFile(req, res, requestUrl.pathname);
});

server.listen(PORT, () => {
    console.log(`musicRate server running on http://localhost:${PORT}`);
});
