# Music Rate

Music Rate is a full-stack music rating application. Users can search Spotify songs and albums, sign in with Google, save ratings, write one comment per item, like comments, and manage their activity from My Page.

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js native HTTP server and ES modules
- Database: SQLite via `node:sqlite`
- Integrations: Spotify Web API, Google OAuth 2.0, Cloudinary

## Features

- Spotify song and album search
- Google sign-in with server-side sessions
- Personal rating create, update, and delete
- One active comment per user for each song or album
- Comment editing, deletion, likes, and like-count ordering
- Separate editable view for the signed-in user's comment
- My Page with ratings, comments, profile editing, and featured music

## Local Development

1. Install dependencies.

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and supply the required credentials.

3. Start the server.

   ```bash
   npm start
   ```

4. Open `http://localhost:3000`.

For local Google OAuth, register `http://localhost:3000/api/auth/google/callback` as an authorized redirect URI.

## Deploying to Render

This repository includes `render.yaml` for a Render Blueprint deployment. It creates a Node web service and mounts a persistent disk at `/var/data` so the SQLite database persists across deploys.

1. Push this repository to GitHub.
2. In Render, select **New +** > **Blueprint** and choose the repository.
3. Enter values for the environment variables marked as secret in `render.yaml`:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `CLOUDINARY_CLOUD_NAME` and `CLOUDINARY_UPLOAD_PRESET` if profile uploads are enabled
4. Deploy the service. Render automatically supplies `PORT`; the app stores SQLite data at `/var/data/music-rate.sqlite`.
5. In Google Cloud Console, add the deployed service origin (for example, `https://music-rate.onrender.com`) to **Authorized JavaScript origins** and add `https://music-rate.onrender.com/api/auth/google/callback` to **Authorized redirect URIs**.

The service derives the Google callback URL from the incoming Render HTTPS request, so `GOOGLE_REDIRECT_URI` does not need to be set in Render.

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `SPOTIFY_CLIENT_ID` | Yes | Spotify API client ID |
| `SPOTIFY_CLIENT_SECRET` | Yes | Spotify API client secret |
| `SESSION_SECRET` | Yes | Secret used to sign OAuth state |
| `DATABASE_PATH` | Render | SQLite database path, set to `/var/data/music-rate.sqlite` |
| `CLOUDINARY_CLOUD_NAME` | Optional | Cloudinary cloud name |
| `CLOUDINARY_UPLOAD_PRESET` | Optional | Cloudinary unsigned upload preset |

## Health Check

`GET /health` returns `{ "ok": true }` and is used by Render to verify that the service is ready.