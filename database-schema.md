# Database Schema

## Goal

This schema uses a single SQLite file for fast iteration while separating:

- core user identity
- external auth provider connections
- login sessions
- ratings and reviews
- community posts, comments, and reactions

## Tables

### users

- `id`: TEXT, PK
- `email`: TEXT, UNIQUE, NULL allowed
- `display_name`: TEXT, NULL allowed
- `avatar_url`: TEXT, NULL allowed
- `bio`: TEXT, NULL allowed
- `status`: TEXT, NOT NULL, default `active`
- `name`: TEXT, legacy nullable field kept for compatibility with existing rows
- `created_at`: DATETIME, default `CURRENT_TIMESTAMP`
- `updated_at`: DATETIME, default `CURRENT_TIMESTAMP`

Notes:

- This is the app-level user record.
- Google login will usually populate `email`, `display_name`, and `avatar_url`.

### auth_accounts

- `id`: TEXT, PK
- `user_id`: TEXT, NOT NULL, FK -> `users.id`
- `provider`: TEXT, NOT NULL
- `provider_user_id`: TEXT, NOT NULL
- `email`: TEXT, NULL allowed
- `access_token`: TEXT, NULL allowed
- `refresh_token`: TEXT, NULL allowed
- `scope`: TEXT, NULL allowed
- `token_expires_at`: DATETIME, NULL allowed
- `created_at`: DATETIME, default `CURRENT_TIMESTAMP`
- `updated_at`: DATETIME, default `CURRENT_TIMESTAMP`

Constraints:

- UNIQUE (`provider`, `provider_user_id`)
- UNIQUE (`user_id`, `provider`)

Notes:

- One user can connect one Google account and one Spotify account.
- Spotify tokens can be refreshed later without touching the main user row.

### sessions

- `id`: TEXT, PK
- `user_id`: TEXT, NOT NULL, FK -> `users.id`
- `expires_at`: DATETIME, NOT NULL
- `created_at`: DATETIME, default `CURRENT_TIMESTAMP`

Notes:

- Intended for server-side session cookies.
- Session rows can be revoked independently.

### ratings

- `user_id`: TEXT, NOT NULL
- `item_id`: TEXT, NOT NULL
- `item_type`: TEXT, NOT NULL
- `title`: TEXT, NOT NULL
- `artist`: TEXT, NULL allowed
- `image`: TEXT, NULL allowed
- `year`: TEXT, NULL allowed
- `rating`: REAL, NOT NULL
- `updated_at`: DATETIME, default `CURRENT_TIMESTAMP`
- `created_at`: DATETIME, default `CURRENT_TIMESTAMP`
- PK: (`user_id`, `item_id`)

Existing purpose retained:

- store a stable snapshot of the rated item
- support user-specific upsert in one statement

### reviews

- `id`: TEXT, PK
- `user_id`: TEXT, NOT NULL, FK -> `users.id`
- `item_id`: TEXT, NOT NULL
- `item_type`: TEXT, NOT NULL
- `title_snapshot`: TEXT, NOT NULL
- `artist_snapshot`: TEXT, NULL allowed
- `image_snapshot`: TEXT, NULL allowed
- `year_snapshot`: TEXT, NULL allowed
- `rating`: REAL, NOT NULL
- `content`: TEXT, NOT NULL
- `visibility`: TEXT, NOT NULL, default `public`
- `created_at`: DATETIME, default `CURRENT_TIMESTAMP`
- `updated_at`: DATETIME, default `CURRENT_TIMESTAMP`
- UNIQUE (`user_id`, `item_id`)

Notes:

- Reviews are separated from ratings so a user can have a rating-only state first.
- Snapshot columns avoid broken historical content if Spotify metadata changes.

### community_posts

- `id`: TEXT, PK
- `user_id`: TEXT, NOT NULL, FK -> `users.id`
- `category`: TEXT, NOT NULL, default `general`
- `title`: TEXT, NOT NULL
- `content`: TEXT, NOT NULL
- `visibility`: TEXT, NOT NULL, default `public`
- `created_at`: DATETIME, default `CURRENT_TIMESTAMP`
- `updated_at`: DATETIME, default `CURRENT_TIMESTAMP`
- `deleted_at`: DATETIME, NULL allowed

Notes:

- `deleted_at` enables soft delete for moderation and audit.

### post_comments

- `id`: TEXT, PK
- `post_id`: TEXT, NOT NULL, FK -> `community_posts.id`
- `user_id`: TEXT, NOT NULL, FK -> `users.id`
- `content`: TEXT, NOT NULL
- `created_at`: DATETIME, default `CURRENT_TIMESTAMP`
- `updated_at`: DATETIME, default `CURRENT_TIMESTAMP`
- `deleted_at`: DATETIME, NULL allowed

### reactions

- `user_id`: TEXT, NOT NULL, FK -> `users.id`
- `target_type`: TEXT, NOT NULL
- `target_id`: TEXT, NOT NULL
- `reaction_type`: TEXT, NOT NULL, default `like`
- `created_at`: DATETIME, default `CURRENT_TIMESTAMP`
- PK: (`user_id`, `target_type`, `target_id`, `reaction_type`)

Notes:

- This can support post likes and later review likes with one table.

## Immediate Next Step

After this schema, the next implementation step is:

1. add `google` login and session creation
2. replace `X-User-Id` usage with authenticated session lookup
3. add Spotify account linking into `auth_accounts`