import http from 'node:http';
import cors from 'cors';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_SEARCH_URL = 'https://api.spotify.com/v1/search';

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
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
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

async function handleSpotifySearchApi(req, res, requestUrl) {
    if (req.method !== 'GET') {
        sendJson(res, 405, { message: 'Method Not Allowed' });
        return;
    }

    const term = (requestUrl.searchParams.get('term') || '').trim();
    const limitParam = Number(requestUrl.searchParams.get('limit') || '10');
    const entity = normalizeSpotifyEntity(requestUrl.searchParams.get('entity') || 'song');

    if (!term) {
        sendJson(res, 400, { message: 'term 파라미터가 필요합니다.' });
        return;
    }

    const limit = Number.isFinite(limitParam) ? Math.floor(Math.min(Math.max(limitParam, 1), 50)) : 10;

    try {
        const accessToken = await getSpotifyAccessToken();
        const spotifyQuery = new URLSearchParams({
            q: term,
            type: entity,
            market: 'KR',
            limit: String(limit)
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
        sendJson(res, 200, payload);
    } catch (error) {
        sendJson(res, 500, {
            message: error instanceof Error ? error.message : 'Spotify 검색 중 오류가 발생했습니다.'
        });
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

    await serveStaticFile(req, res, requestUrl.pathname);
});

server.listen(PORT, () => {
    console.log(`musicRate server running on http://localhost:${PORT}`);
});
