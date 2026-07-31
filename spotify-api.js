function getBackendSpotifySearchUrl() {
    if (typeof window !== 'undefined' && window.location) {
        if (window.location.protocol === 'file:') {
            return 'http://localhost:3000/api/spotify/search';
        }

        const hostname = window.location.hostname;
        if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
            return 'http://localhost:3000/api/spotify/search';
        }

        return `${window.location.protocol}//${window.location.host}/api/spotify/search`;
    }

    return 'http://localhost:3000/api/spotify/search';
}

function toYear(releaseDate) {
    if (!releaseDate) {
        return '-';
    }

    const parsedDate = new Date(releaseDate);
    if (Number.isNaN(parsedDate.getTime())) {
        return '-';
    }

    return String(parsedDate.getFullYear());
}

function toArtworkUrl(artworkUrl100) {
    if (!artworkUrl100) {
        return '';
    }

    return artworkUrl100;
}

function getArtistNames(artists) {
    if (!Array.isArray(artists) || !artists.length) {
        return 'Unknown';
    }

    return artists.map((artist) => artist?.name).filter(Boolean).join(', ') || 'Unknown';
}

function mapSpotifyTrackToMedia(track) {
    const title = track?.name || 'Untitled';
    const artist = getArtistNames(track?.artists);
    const year = toYear(track?.album?.release_date);
    const image = toArtworkUrl(track?.album?.images?.[0]?.url || '');

    return {
        id: track?.id || `${title}-${artist}-${year}`,
        title,
        artist,
        year,
        rating: '-',
        typeLabel: '음악',
        image
    };
}

function mapSpotifyAlbumToMedia(album) {
    const title = album?.name || 'Untitled';
    const artist = getArtistNames(album?.artists);
    const year = toYear(album?.release_date);
    const image = toArtworkUrl(album?.images?.[0]?.url || '');

    return {
        id: album?.id || `${title}-${artist}-${year}`,
        title,
        artist,
        year,
        rating: '-',
        typeLabel: '앨범',
        image
    };
}

function normalizeSearchArgs(args) {
    if (typeof args === 'string') {
        return {
            term: args,
            entity: 'song',
            limit: 10
        };
    }

    if (!args || typeof args !== 'object') {
        return {
            term: '',
            entity: 'song',
            limit: 10
        };
    }

    return {
        term: args.term,
        entity: args.entity ?? 'song',
        limit: args.limit ?? 10
    };
}

export async function searchSpotifyMedia(args) {
    const { term, entity = 'song', limit = 10 } = normalizeSearchArgs(args);
    const normalizedEntity = entity === 'album' ? 'album' : 'track';
    const query = new URLSearchParams({
        term: term || '',
        entity,
        limit: String(limit)
    });

    const baseUrl = getBackendSpotifySearchUrl();
    const url = `${baseUrl}?${query.toString()}`;
    const response = await fetch(url, {
        headers: {
            Accept: 'application/json'
        }
    });
    if (!response.ok) {
        let errorMessage = `Spotify API 요청 실패: ${response.status}`;

        try {
            const errorPayload = await response.json();
            if (errorPayload?.message) {
                errorMessage = errorPayload.message;
            }
        } catch {
            // 응답 파싱 실패 시 기본 메시지를 사용합니다.
        }

        throw new Error(errorMessage);
    }

    const payload = await response.json();
    const resultKey = normalizedEntity === 'album' ? 'albums' : 'tracks';
    const rawItems = Array.isArray(payload?.[resultKey]?.items) ? payload[resultKey].items : [];

    return normalizedEntity === 'album'
        ? rawItems.map(mapSpotifyAlbumToMedia)
        : rawItems.map(mapSpotifyTrackToMedia);
}
