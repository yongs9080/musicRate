import path from 'node:path';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATABASE_PATH = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(__dirname, 'music-rate.sqlite');

fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

function toIsoTimestamp(value) {
    if (!value) {
        return null;
    }

    const normalizedValue = typeof value === 'string' && !value.endsWith('Z')
        ? `${value.replace(' ', 'T')}Z`
        : value;
    const date = new Date(normalizedValue);

    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const db = new DatabaseSync(DATABASE_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT,
        display_name TEXT,
        avatar_url TEXT,
        bio TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auth_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        email TEXT,
        access_token TEXT,
        refresh_token TEXT,
        scope TEXT,
        token_expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE (provider, provider_user_id),
        UNIQUE (user_id, provider)
    );

    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ratings (
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_type TEXT NOT NULL,
        title TEXT NOT NULL,
        artist TEXT,
        image TEXT,
        year TEXT,
        rating REAL NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, item_id),
        FOREIGN KEY (user_id) REFERENCES users (id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_type TEXT NOT NULL,
        title_snapshot TEXT NOT NULL,
        artist_snapshot TEXT,
        image_snapshot TEXT,
        year_snapshot TEXT,
        rating REAL NOT NULL,
        content TEXT NOT NULL,
        visibility TEXT NOT NULL DEFAULT 'public',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE (user_id, item_id)
    );

    CREATE TABLE IF NOT EXISTS music_comments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_type TEXT NOT NULL,
        title_snapshot TEXT NOT NULL,
        artist_snapshot TEXT,
        image_snapshot TEXT,
        year_snapshot TEXT,
        content TEXT NOT NULL,
        visibility TEXT NOT NULL DEFAULT 'public',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS community_posts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        visibility TEXT NOT NULL DEFAULT 'public',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS post_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME,
        FOREIGN KEY (post_id) REFERENCES community_posts (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reactions (
        user_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reaction_type TEXT NOT NULL DEFAULT 'like',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, target_type, target_id, reaction_type),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_auth_accounts_user_provider
    ON auth_accounts (user_id, provider);

    CREATE INDEX IF NOT EXISTS idx_sessions_user_expires
    ON sessions (user_id, expires_at DESC);

    CREATE INDEX IF NOT EXISTS idx_ratings_user_updated
    ON ratings (user_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_ratings_item
    ON ratings (item_id);

    CREATE INDEX IF NOT EXISTS idx_reviews_user_updated
    ON reviews (user_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_reviews_item_created
    ON reviews (item_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_music_comments_item_created
    ON music_comments (item_id, item_type, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_music_comments_user_created
    ON music_comments (user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_community_posts_user_updated
    ON community_posts (user_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_community_posts_created
    ON community_posts (created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_post_comments_post_created
    ON post_comments (post_id, created_at ASC);

    CREATE INDEX IF NOT EXISTS idx_reactions_target
    ON reactions (target_type, target_id, created_at DESC);
`);

db.exec(`
    DELETE FROM reactions
    WHERE target_type = 'music_comment'
      AND target_id IN (
          SELECT older.id
          FROM music_comments older
          INNER JOIN music_comments newer
              ON newer.user_id = older.user_id
              AND newer.item_id = older.item_id
              AND newer.item_type = older.item_type
              AND newer.deleted_at IS NULL
              AND older.deleted_at IS NULL
              AND (
                  newer.created_at > older.created_at
                  OR (newer.created_at = older.created_at AND newer.rowid > older.rowid)
              )
      );

    DELETE FROM music_comments
    WHERE deleted_at IS NULL
      AND EXISTS (
          SELECT 1
          FROM music_comments newer
          WHERE newer.user_id = music_comments.user_id
            AND newer.item_id = music_comments.item_id
            AND newer.item_type = music_comments.item_type
            AND newer.deleted_at IS NULL
            AND (
                newer.created_at > music_comments.created_at
                OR (newer.created_at = music_comments.created_at AND newer.rowid > music_comments.rowid)
            )
      );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_music_comments_one_active_per_user_item
    ON music_comments (user_id, item_id, item_type)
    WHERE deleted_at IS NULL;
`);

function getTableColumns(tableName) {
    return db.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => row.name);
}

function addColumnIfMissing(tableName, columnName, columnDefinition) {
    const columnNames = new Set(getTableColumns(tableName));
    if (columnNames.has(columnName)) {
        return;
    }

    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
}

function migrateUsersTable() {
    addColumnIfMissing('users', 'email', 'email TEXT');
    addColumnIfMissing('users', 'display_name', 'display_name TEXT');
    addColumnIfMissing('users', 'avatar_url', 'avatar_url TEXT');
    addColumnIfMissing('users', 'bio', 'bio TEXT');
    addColumnIfMissing('users', 'featured_music_json', 'featured_music_json TEXT');
    addColumnIfMissing('users', 'status', "status TEXT NOT NULL DEFAULT 'active'");
    addColumnIfMissing('users', 'updated_at', 'updated_at DATETIME');

    db.exec(`
        UPDATE users
        SET display_name = COALESCE(NULLIF(display_name, ''), NULLIF(name, ''), display_name)
        WHERE display_name IS NULL OR display_name = '';

        UPDATE users
        SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
        WHERE updated_at IS NULL;
    `);

    db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
        ON users (email);
    `);
}

migrateUsersTable();

const ensureUserStatement = db.prepare(`
    INSERT INTO users (id)
    VALUES (?)
    ON CONFLICT(id) DO NOTHING
`);

const upsertRatingStatement = db.prepare(`
    INSERT INTO ratings (
        user_id,
        item_id,
        item_type,
        title,
        artist,
        image,
        year,
        rating
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, item_id) DO UPDATE SET
        item_type = excluded.item_type,
        title = excluded.title,
        artist = excluded.artist,
        image = excluded.image,
        year = excluded.year,
        rating = excluded.rating,
        updated_at = CURRENT_TIMESTAMP
`);

const getRatingStatement = db.prepare(`
    SELECT user_id, item_id, rating, updated_at
    FROM ratings
    WHERE user_id = ? AND item_id = ?
`);

const listRatingsStatement = db.prepare(`
    SELECT item_id, item_type, title, artist, image, year, rating, updated_at
    FROM ratings
    WHERE user_id = ?
    ORDER BY updated_at DESC, created_at DESC, item_id ASC
    LIMIT ? OFFSET ?
`);

const countRatingsStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM ratings
    WHERE user_id = ?
`);

const deleteRatingStatement = db.prepare(`
    DELETE FROM ratings
    WHERE user_id = ? AND item_id = ?
`);

const insertMusicCommentStatement = db.prepare(`
    INSERT INTO music_comments (
        id,
        user_id,
        item_id,
        item_type,
        title_snapshot,
        artist_snapshot,
        image_snapshot,
        year_snapshot,
        content,
        visibility
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const findActiveMusicCommentByUserAndItemStatement = db.prepare(`
        SELECT id
        FROM music_comments
        WHERE user_id = ?
            AND item_id = ?
            AND item_type = ?
            AND deleted_at IS NULL
        LIMIT 1
`);

const getMusicCommentByIdStatement = db.prepare(`
    SELECT
        mc.id,
        mc.user_id,
        mc.item_id,
        mc.item_type,
        mc.title_snapshot,
        mc.artist_snapshot,
        mc.image_snapshot,
        mc.year_snapshot,
        mc.content,
        mc.visibility,
        mc.created_at,
        mc.updated_at,
        u.display_name,
        u.avatar_url,
        COUNT(r.target_id) AS like_count,
        MAX(CASE WHEN r.user_id = ? AND r.target_type = 'music_comment' AND r.reaction_type = 'like' THEN 1 ELSE 0 END) AS liked_by_me
    FROM music_comments mc
    INNER JOIN users u ON u.id = mc.user_id
    LEFT JOIN reactions r ON r.target_type = 'music_comment' AND r.target_id = mc.id AND r.reaction_type = 'like'
    WHERE mc.id = ?
      AND mc.deleted_at IS NULL
    GROUP BY mc.id, mc.user_id, mc.item_id, mc.item_type, mc.title_snapshot, mc.artist_snapshot, mc.image_snapshot, mc.year_snapshot, mc.content, mc.visibility, mc.created_at, mc.updated_at, u.display_name, u.avatar_url
`);

const listMusicCommentsByItemStatement = db.prepare(`
    SELECT
        mc.id,
        mc.user_id,
        mc.item_id,
        mc.item_type,
        mc.title_snapshot,
        mc.artist_snapshot,
        mc.image_snapshot,
        mc.year_snapshot,
        mc.content,
        mc.visibility,
        mc.created_at,
        mc.updated_at,
        u.display_name,
        u.avatar_url,
        COUNT(r.target_id) AS like_count,
        MAX(CASE WHEN r.user_id = ? AND r.target_type = 'music_comment' AND r.reaction_type = 'like' THEN 1 ELSE 0 END) AS liked_by_me
    FROM music_comments mc
    INNER JOIN users u ON u.id = mc.user_id
    LEFT JOIN reactions r ON r.target_type = 'music_comment' AND r.target_id = mc.id AND r.reaction_type = 'like'
    WHERE mc.item_id = ?
      AND mc.item_type = ?
      AND mc.deleted_at IS NULL
      AND mc.visibility = 'public'
    GROUP BY mc.id, mc.user_id, mc.item_id, mc.item_type, mc.title_snapshot, mc.artist_snapshot, mc.image_snapshot, mc.year_snapshot, mc.content, mc.visibility, mc.created_at, mc.updated_at, u.display_name, u.avatar_url
    ORDER BY like_count DESC, mc.created_at DESC, mc.id DESC
    LIMIT ? OFFSET ?
`);

const countMusicCommentsByItemStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM music_comments
    WHERE item_id = ?
      AND item_type = ?
      AND deleted_at IS NULL
      AND visibility = 'public'
`);

const listMusicCommentsByUserStatement = db.prepare(`
    SELECT
        mc.id,
        mc.user_id,
        mc.item_id,
        mc.item_type,
        mc.title_snapshot,
        mc.artist_snapshot,
        mc.image_snapshot,
        mc.year_snapshot,
        mc.content,
        mc.visibility,
        mc.created_at,
        mc.updated_at,
        u.display_name,
        u.avatar_url,
        COUNT(r.target_id) AS like_count,
        MAX(CASE WHEN r.user_id = ? AND r.target_type = 'music_comment' AND r.reaction_type = 'like' THEN 1 ELSE 0 END) AS liked_by_me
    FROM music_comments mc
    INNER JOIN users u ON u.id = mc.user_id
    LEFT JOIN reactions r ON r.target_type = 'music_comment' AND r.target_id = mc.id AND r.reaction_type = 'like'
    WHERE mc.user_id = ?
      AND mc.deleted_at IS NULL
    GROUP BY mc.id, mc.user_id, mc.item_id, mc.item_type, mc.title_snapshot, mc.artist_snapshot, mc.image_snapshot, mc.year_snapshot, mc.content, mc.visibility, mc.created_at, mc.updated_at, u.display_name, u.avatar_url
    ORDER BY like_count DESC, mc.created_at DESC, mc.id DESC
    LIMIT ? OFFSET ?
`);

const countMusicCommentsByUserStatement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM music_comments
    WHERE user_id = ?
      AND deleted_at IS NULL
`);

const updateMusicCommentStatement = db.prepare(`
    UPDATE music_comments
    SET content = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND user_id = ?
      AND deleted_at IS NULL
`);

const softDeleteMusicCommentStatement = db.prepare(`
    UPDATE music_comments
    SET deleted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND user_id = ?
      AND deleted_at IS NULL
`);

const addCommentLikeStatement = db.prepare(`
    INSERT INTO reactions (user_id, target_type, target_id, reaction_type)
    VALUES (?, 'music_comment', ?, 'like')
`);

const removeCommentLikeStatement = db.prepare(`
    DELETE FROM reactions
    WHERE user_id = ?
      AND target_type = 'music_comment'
      AND target_id = ?
      AND reaction_type = 'like'
`);

const getCommentLikeStateStatement = db.prepare(`
    SELECT COUNT(*) AS liked
    FROM reactions
    WHERE user_id = ?
      AND target_type = 'music_comment'
      AND target_id = ?
      AND reaction_type = 'like'
`);

const countCommentLikeStatement = db.prepare(`
    SELECT COUNT(*) AS like_count
    FROM reactions
    WHERE target_type = 'music_comment'
      AND target_id = ?
      AND reaction_type = 'like'
`);

const findUserByIdStatement = db.prepare(`
    SELECT id, email, display_name, avatar_url, bio, featured_music_json, status, created_at, updated_at
    FROM users
    WHERE id = ?
`);

const findUserByEmailStatement = db.prepare(`
    SELECT id, email, display_name, avatar_url, bio, featured_music_json, status, created_at, updated_at
    FROM users
    WHERE email = ?
`);

const findUserByAuthAccountStatement = db.prepare(`
    SELECT u.id, u.email, u.display_name, u.avatar_url, u.bio, u.featured_music_json, u.status, u.created_at, u.updated_at
    FROM auth_accounts a
    INNER JOIN users u ON u.id = a.user_id
    WHERE a.provider = ? AND a.provider_user_id = ?
`);

const insertUserStatement = db.prepare(`
    INSERT INTO users (
        id,
        email,
        display_name,
        avatar_url,
        status,
        name,
        updated_at
    )
    VALUES (?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)
`);

const updateUserProfileStatement = db.prepare(`
    UPDATE users
    SET
        email = COALESCE(?, email),
        display_name = COALESCE(?, display_name),
        avatar_url = COALESCE(?, avatar_url),
        featured_music_json = COALESCE(?, featured_music_json),
        name = COALESCE(?, name),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
`);

const upsertAuthAccountStatement = db.prepare(`
    INSERT INTO auth_accounts (
        id,
        user_id,
        provider,
        provider_user_id,
        email,
        access_token,
        refresh_token,
        scope,
        token_expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, provider_user_id) DO UPDATE SET
        user_id = excluded.user_id,
        email = excluded.email,
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, auth_accounts.refresh_token),
        scope = excluded.scope,
        token_expires_at = excluded.token_expires_at,
        updated_at = CURRENT_TIMESTAMP
`);

const insertSessionStatement = db.prepare(`
    INSERT INTO sessions (
        id,
        user_id,
        expires_at
    )
    VALUES (?, ?, ?)
`);

const getSessionWithUserStatement = db.prepare(`
    SELECT
        s.id AS session_id,
        s.expires_at AS session_expires_at,
        u.id,
        u.email,
        u.display_name,
        u.avatar_url,
        u.bio,
        u.featured_music_json,
        u.status,
        u.created_at,
        u.updated_at
    FROM sessions s
    INNER JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
`);

const deleteSessionStatement = db.prepare(`
    DELETE FROM sessions
    WHERE id = ?
`);

const deleteExpiredSessionsStatement = db.prepare(`
    DELETE FROM sessions
    WHERE expires_at <= CURRENT_TIMESTAMP
`);

function createItemRatingsStatement(itemIds) {
    const placeholders = itemIds.map(() => '?').join(', ');

    return db.prepare(`
        SELECT item_id, rating
        FROM ratings
        WHERE user_id = ? AND item_id IN (${placeholders})
    `);
}

function mapRatingRow(row) {
    return {
        itemId: row.item_id,
        itemType: row.item_type,
        title: row.title,
        artist: row.artist,
        image: row.image,
        year: row.year,
        rating: row.rating,
        updatedAt: toIsoTimestamp(row.updated_at)
    };
}

function mapMusicCommentRow(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        userId: row.user_id,
        itemId: row.item_id,
        itemType: row.item_type,
        title: row.title_snapshot,
        artist: row.artist_snapshot,
        image: row.image_snapshot,
        year: row.year_snapshot,
        content: row.content,
        visibility: row.visibility,
        likeCount: Number(row.like_count ?? row.likeCount ?? 0),
        likedByMe: Boolean(row.liked_by_me ?? row.likedByMe ?? false),
        createdAt: toIsoTimestamp(row.created_at),
        updatedAt: toIsoTimestamp(row.updated_at),
        user: {
            id: row.user_id,
            displayName: row.display_name,
            avatarUrl: row.avatar_url
        }
    };
}

function mapUserRow(row) {
    if (!row) {
        return null;
    }

    let featuredMusic = [];
    if (typeof row.featured_music_json === 'string' && row.featured_music_json.trim()) {
        try {
            const parsed = JSON.parse(row.featured_music_json);
            if (Array.isArray(parsed)) {
                featuredMusic = parsed;
            }
        } catch {
            featuredMusic = [];
        }
    }

    return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        bio: row.bio,
        featuredMusic,
        status: row.status,
        createdAt: toIsoTimestamp(row.created_at),
        updatedAt: toIsoTimestamp(row.updated_at)
    };
}

function runInTransaction(callback) {
    db.exec('BEGIN IMMEDIATE');

    try {
        const result = callback();
        db.exec('COMMIT');
        return result;
    } catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}

export function ensureUser(userId) {
    ensureUserStatement.run(userId);
}

export function findUserById(userId) {
    return mapUserRow(findUserByIdStatement.get(userId));
}

export function updateUserProfile({ userId, displayName = null, avatarUrl = null, featuredMusic = null }) {
    ensureUser(userId);

    const normalizedDisplayName = typeof displayName === 'string'
        ? displayName.trim() || null
        : null;
    const normalizedAvatarUrl = typeof avatarUrl === 'string'
        ? avatarUrl.trim() || null
        : null;
    const normalizedFeaturedMusic = Array.isArray(featuredMusic)
        ? JSON.stringify(featuredMusic)
        : null;

    updateUserProfileStatement.run(
        null,
        normalizedDisplayName,
        normalizedAvatarUrl,
        normalizedFeaturedMusic,
        normalizedDisplayName,
        userId
    );

    return findUserById(userId);
}

export function upsertUserFromAuthAccount({
    provider,
    providerUserId,
    email = null,
    displayName = null,
    avatarUrl = null,
    accessToken = null,
    refreshToken = null,
    scope = null,
    tokenExpiresAt = null
}) {
    const normalizedEmail = email ? email.trim().toLowerCase() : null;
    const normalizedDisplayName = displayName ? displayName.trim() : null;
    const normalizedAvatarUrl = avatarUrl ? avatarUrl.trim() : null;
    const normalizedProvider = provider.trim();
    const normalizedProviderUserId = providerUserId.trim();

    return runInTransaction(() => {
        const existingProviderUser = mapUserRow(findUserByAuthAccountStatement.get(normalizedProvider, normalizedProviderUserId));
        const existingEmailUser = normalizedEmail ? mapUserRow(findUserByEmailStatement.get(normalizedEmail)) : null;
        const existingUser = existingProviderUser || existingEmailUser;
        const resolvedUserId = existingProviderUser?.id || existingEmailUser?.id || randomUUID();

        if (!existingProviderUser && !existingEmailUser) {
            insertUserStatement.run(
                resolvedUserId,
                normalizedEmail,
                normalizedDisplayName,
                normalizedAvatarUrl,
                normalizedDisplayName
            );
        } else {
            const shouldKeepDisplayName = Boolean(existingUser?.displayName?.trim());
            const shouldKeepAvatarUrl = Boolean(existingUser?.avatarUrl?.trim());
            const nextDisplayName = shouldKeepDisplayName ? null : normalizedDisplayName;
            const nextAvatarUrl = shouldKeepAvatarUrl ? null : normalizedAvatarUrl;

            updateUserProfileStatement.run(
                normalizedEmail,
                nextDisplayName,
                nextAvatarUrl,
                null,
                nextDisplayName,
                resolvedUserId
            );
        }

        upsertAuthAccountStatement.run(
            `${normalizedProvider}:${normalizedProviderUserId}`,
            resolvedUserId,
            normalizedProvider,
            normalizedProviderUserId,
            normalizedEmail,
            accessToken,
            refreshToken,
            scope,
            tokenExpiresAt
        );

        return findUserById(resolvedUserId);
    });
}

export function createSessionForUser(userId, expiresAt) {
    const sessionId = randomUUID();
    insertSessionStatement.run(sessionId, userId, expiresAt);

    return {
        sessionId,
        user: findUserById(userId),
        expiresAt: toIsoTimestamp(expiresAt)
    };
}

export function findUserBySessionId(sessionId) {
    if (!sessionId) {
        return null;
    }

    deleteExpiredSessionsStatement.run();
    const sessionRow = getSessionWithUserStatement.get(sessionId);
    if (!sessionRow) {
        return null;
    }

    return {
        sessionId: sessionRow.session_id,
        expiresAt: toIsoTimestamp(sessionRow.session_expires_at),
        user: mapUserRow(sessionRow)
    };
}

export function deleteSession(sessionId) {
    if (!sessionId) {
        return;
    }

    deleteSessionStatement.run(sessionId);
}

export function upsertRating({ userId, itemId, itemType, title, artist = null, image = null, year = null, rating }) {
    ensureUser(userId);
    upsertRatingStatement.run(userId, itemId, itemType, title, artist, image, year, rating);

    const savedRow = getRatingStatement.get(userId, itemId);
    return {
        userId: savedRow.user_id,
        itemId: savedRow.item_id,
        rating: savedRow.rating,
        updatedAt: toIsoTimestamp(savedRow.updated_at)
    };
}

export function listRatingsByUser({ userId, limit, offset }) {
    ensureUser(userId);
    const rows = listRatingsStatement.all(userId, limit, offset);
    const total = countRatingsStatement.get(userId)?.total || 0;

    return {
        items: rows.map(mapRatingRow),
        total,
        limit,
        offset,
        hasMore: offset + rows.length < total
    };
}

export function getRatingsByItemIds({ userId, itemIds }) {
    ensureUser(userId);
    if (!itemIds.length) {
        return {};
    }

    const statement = createItemRatingsStatement(itemIds);
    const rows = statement.all(userId, ...itemIds);

    return rows.reduce((ratingsByItemId, row) => {
        ratingsByItemId[row.item_id] = row.rating;
        return ratingsByItemId;
    }, {});
}

export function deleteRating({ userId, itemId }) {
    ensureUser(userId);
    deleteRatingStatement.run(userId, itemId);
}

export function createMusicComment({
    userId,
    itemId,
    itemType,
    title,
    artist = null,
    image = null,
    year = null,
    content,
    visibility = 'public'
}) {
    ensureUser(userId);

    if (findActiveMusicCommentByUserAndItemStatement.get(userId, itemId, itemType)) {
        throw new Error('comment already exists for this item');
    }

    const commentId = randomUUID();
    insertMusicCommentStatement.run(
        commentId,
        userId,
        itemId,
        itemType,
        title,
        artist,
        image,
        year,
        content,
        visibility
    );

    return mapMusicCommentRow(getMusicCommentByIdStatement.get(commentId));
}

export function listMusicCommentsByItem({ itemId, itemType = 'album', limit, offset, viewerUserId = null }) {
    const rows = listMusicCommentsByItemStatement.all(viewerUserId || null, itemId, itemType, limit, offset);
    const total = countMusicCommentsByItemStatement.get(itemId, itemType)?.total || 0;

    return {
        items: rows.map(mapMusicCommentRow),
        total,
        limit,
        offset,
        hasMore: offset + rows.length < total
    };
}

export function listMusicCommentsByUser({ userId, limit, offset, viewerUserId = userId }) {
    ensureUser(userId);
    const rows = listMusicCommentsByUserStatement.all(viewerUserId || null, userId, limit, offset);
    const total = countMusicCommentsByUserStatement.get(userId)?.total || 0;

    return {
        items: rows.map(mapMusicCommentRow),
        total,
        limit,
        offset,
        hasMore: offset + rows.length < total
    };
}

export function updateMusicComment({ userId, commentId, content }) {
    ensureUser(userId);
    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    if (!normalizedContent) {
        throw new Error('comment content is required');
    }

    const result = updateMusicCommentStatement.run(normalizedContent, commentId, userId);
    if (!result.changes) {
        throw new Error('comment not found');
    }

    return mapMusicCommentRow(getMusicCommentByIdStatement.get(userId, commentId));
}

export function toggleCommentLike({ userId, commentId }) {
    ensureUser(userId);
    const existingLike = getCommentLikeStateStatement.get(userId, commentId)?.liked || 0;
    const shouldLike = existingLike === 0;

    runInTransaction(() => {
        if (shouldLike) {
            addCommentLikeStatement.run(userId, commentId);
            return;
        }

        removeCommentLikeStatement.run(userId, commentId);
    });

    const likeCount = countCommentLikeStatement.get(commentId)?.like_count || 0;
    return {
        liked: shouldLike,
        likeCount
    };
}

export function deleteMusicComment({ userId, commentId }) {
    ensureUser(userId);
    const result = softDeleteMusicCommentStatement.run(commentId, userId);
    return (result?.changes || 0) > 0;
}

export function closeRatingsDatabase() {
    db.close();
}