const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';

function normalizeId(text) {
    return (text || 'item')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-]/g, '') || 'item';
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

    return artworkUrl100.replace(/100x100bb/g, '400x400bb');
}

function mapItunesItemToMedia(item) {
    const title = item.trackName || item.collectionName || 'Untitled';
    const artist = item.artistName || 'Unknown';
    const year = toYear(item.releaseDate);
    const typeLabel = item.wrapperType === 'collection' ? '앨범' : '음악';
    const sourceId = item.trackId || item.collectionId || `${title}-${artist}-${year}`;

    return {
        id: normalizeId(String(sourceId)),
        title,
        artist,
        year,
        rating: '-',
        typeLabel,
        image: toArtworkUrl(item.artworkUrl100)
    };
}

export async function searchItunesMedia({ term, entity = 'song', attribute, limit = 10 }) {
    const query = new URLSearchParams({
        term,
        media: 'music',
        entity,
        country: 'KR',
        lang: 'ko_kr',
        limit: String(limit)
    });

    if (attribute) {
        query.set('attribute', attribute);
    }

    const response = await fetch(`${ITUNES_SEARCH_URL}?${query.toString()}`);
    if (!response.ok) {
        throw new Error(`iTunes API 요청 실패: ${response.status}`);
    }

    const payload = await response.json();
    const results = Array.isArray(payload.results) ? payload.results : [];

    return results.map(mapItunesItemToMedia);
}
