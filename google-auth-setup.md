# Google OAuth Setup

## 1. Create OAuth client

In Google Cloud Console:

1. Create or select a project.
2. Open `APIs & Services > OAuth consent screen`.
3. Configure the app name, support email, and developer contact email.
4. Add the scopes below:
   - `openid`
   - `email`
   - `profile`
5. Open `APIs & Services > Credentials`.
6. Create `OAuth client ID`.
7. Choose `Web application`.

## 2. Set redirect URIs

For local development, add:

- `http://localhost:3000/api/auth/google/callback`

If you run on another port during development, add that too:

- `http://localhost:3001/api/auth/google/callback`

For production, add the real deployed callback URL.

## 3. Set JavaScript origins

Add the local origins you use:

- `http://localhost:3000`
- `http://localhost:3001`

## 4. Fill local environment

Create or update `.env` in the project root:

```env
GOOGLE_CLIENT_ID=your_real_google_client_id
GOOGLE_CLIENT_SECRET=your_real_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
SESSION_SECRET=replace_with_a_long_random_secret
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
PORT=3000
```

## 5. Start the app

```powershell
npm start
```

Then open:

- `http://localhost:3000`

## 6. Expected behavior

1. Click `Google 로그인`.
2. Complete the Google consent flow.
3. The server creates a session cookie.
4. The app returns to `#mypage` and `GET /api/me` reports the authenticated user.
5. Rating controls become enabled for that user.

## Notes

- The current implementation uses a server-side session cookie, not a client-managed user ID header.
- Without real Google credentials in `.env`, the app will stay usable but show an auth configuration message instead of completing login.