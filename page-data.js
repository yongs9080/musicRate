export function createCoverImage(labelText) {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
            <rect width="160" height="160" rx="24" fill="#e9eefc" />
            <rect x="24" y="24" width="112" height="112" rx="18" fill="#4169e1" opacity="0.16" />
            <circle cx="80" cy="72" r="28" fill="#4169e1" opacity="0.85" />
            <path d="M64 96c12 10 22 14 32 14" stroke="#ffffff" stroke-width="8" stroke-linecap="round" />
            <text x="80" y="138" text-anchor="middle" font-size="18" font-family="Arial, sans-serif" fill="#1f2937">${labelText}</text>
        </svg>
    `;

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createAvatarImage(nameText) {
    const initial = (nameText || 'U').charAt(0);
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
            <defs>
                <linearGradient id="avatarBg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#dbeafe" />
                    <stop offset="100%" stop-color="#bfdbfe" />
                </linearGradient>
            </defs>
            <rect width="160" height="160" rx="80" fill="url(#avatarBg)" />
            <circle cx="80" cy="64" r="30" fill="#1d4ed8" opacity="0.2" />
            <path d="M38 134c10-28 26-38 42-38s32 10 42 38" fill="#1d4ed8" opacity="0.22" />
            <text x="80" y="93" text-anchor="middle" font-size="52" font-family="Arial, sans-serif" fill="#1e3a8a" font-weight="700">${initial}</text>
        </svg>
    `;

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function normalizeId(text) {
    return (text || 'item')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-]/g, '') || 'item';
}

export function createMediaItem({ id, title, artist, year, rating, myRating, imageLabel, image, itemType, typeLabel = '곡' }) {
    const resolvedTitle = title || 'Untitled';
    const resolvedTypeLabel = typeLabel || (itemType === 'album' ? '앨범' : '곡');
    const resolvedItemType = itemType || (resolvedTypeLabel === '앨범' ? 'album' : 'song');

    return {
        id: id || normalizeId(`${resolvedTitle}-${artist || ''}-${year || ''}`),
        title: resolvedTitle,
        artist: artist || 'Unknown',
        year: year || '-',
        rating: rating || '-',
        myRating,
        itemType: resolvedItemType,
        typeLabel: resolvedTypeLabel,
        image: image || createCoverImage(imageLabel || resolvedTitle.slice(0, 2).toUpperCase())
    };
}

function createHorizontalMediaSection({ title, items = [], description = '' }) {
    return {
        type: 'list',
        title,
        description,
        layout: 'horizontal',
        items
    };
}

function createTextListSection({ title, description = '', items = [] }) {
    return {
        type: 'list',
        title,
        description,
        items
    };
}

function createProfileSectionData({ name, subtitle, image }) {
    return {
        type: 'profile',
        name,
        subtitle,
        image: image || createAvatarImage(name)
    };
}

function createActionSectionData({ label, targetPage, actionKey }) {
    return {
        type: 'action',
        label,
        targetPage,
        actionKey: actionKey || ''
    };
}

function createProfileEditorSectionData({ cancelRoute = 'mypage' } = {}) {
    return {
        type: 'profile-editor',
        nameValue: '',
        imageValue: '',
        imagePreview: createAvatarImage('U'),
        cancelRoute
    };
}

function createSearchFilterSectionData() {
    return {
        type: 'search-filter',
        activeFilter: 'all',
        options: [
            { key: 'all', label: '전체' },
            { key: 'album', label: '앨범' },
            { key: 'song', label: '곡' }
        ]
    };
}

function createFeaturedMusicSectionData() {
    return {
        type: 'featured-music',
        title: '대표 음악',
        description: '최대 3개의 앨범/곡을 선택할 수 있습니다.',
        items: []
    };
}

function createMyCommentsSectionData() {
    return {
        type: 'comment-feed',
        title: '내 코멘트',
        description: '작성한 코멘트를 확인할 수 있습니다.',
        items: []
    };
}

export const pages = {
    home: [
        createHorizontalMediaSection({
            title: '추천 음악/앨범',
            items: [
                createMediaItem({ title: 'Midnight Echo', artist: 'Nova', year: '2024', rating: '4.8', imageLabel: 'ME', typeLabel: '앨범' }),
                createMediaItem({ title: 'Summer Rain', artist: 'Lina', year: '2023', rating: '4.7', imageLabel: 'SR', typeLabel: '앨범' }),
                createMediaItem({ title: 'Blue Horizon', artist: 'Mio', year: '2022', rating: '4.9', imageLabel: 'BH', typeLabel: '앨범' })
            ]
        }),
        createHorizontalMediaSection({
            title: '최근 평가',
            items: [
                createMediaItem({ title: '아리아', artist: 'Eun', year: '2024', rating: '5.0', imageLabel: 'AR', typeLabel: '곡' }),
                createMediaItem({ title: 'Winter Bloom', artist: 'Mina', year: '2023', rating: '4.8', imageLabel: 'WB', typeLabel: '곡' }),
                createMediaItem({ title: 'Sparkle', artist: 'Noah', year: '2022', rating: '4.6', imageLabel: 'SP', typeLabel: '곡' })
            ]
        })
    ],
    genre: [
        createTextListSection({
            title: '장르별 추천',
            description: '장르를 기준으로 음악을 탐색해보세요.',
            items: ['팝', '재즈', '락', '랩', '클래식']
        })
    ],
    review: [
        createTextListSection({
            title: '최근 리뷰',
            description: '사용자 리뷰와 평점이 표시됩니다.',
            items: ['새 앨범 리뷰', '인디 음악 추천', '평점 높은 곡 소개']
        })
    ],
    community: [
        createTextListSection({
            title: '커뮤니티',
            description: '다른 유저와 음악 이야기를 나눠보세요.',
            items: ['최신 토론', '추천 음악 공유', '좋아요한 리뷰 보기']
        })
    ],
    search: [
        createSearchFilterSectionData(),
        createHorizontalMediaSection({
            title: '검색 결과',
            description: '검색어에 대한 음악을 확인하세요.',
            items: []
        })
    ],
    myRatedMusic: [
        createHorizontalMediaSection({
            title: '내가 평가한 음악',
            description: '저장된 평점을 불러오는 중입니다.',
            items: []
        })
    ],
    mypage: [
        createProfileSectionData({
            name: 'Demo User',
            subtitle: '평가 데이터를 불러오는 중입니다.',
            image: createAvatarImage('D')
        }),
        createActionSectionData({
            label: '프로필 수정',
            targetPage: 'profileEdit'
        }),
        createActionSectionData({
            label: '내가 평가한 음악',
            targetPage: 'myRatedMusic'
        }),
        createFeaturedMusicSectionData(),
        createMyCommentsSectionData(),
        createHorizontalMediaSection({
            title: '최근 평가한 곡',
            description: '저장된 최근 평점을 불러오는 중입니다.',
            items: []
        })
    ],
    profileEdit: [
        createProfileEditorSectionData({
            cancelRoute: 'mypage'
        })
    ]
};

export const pageActiveTabMap = {
    myRatedMusic: 'mypage',
    profileEdit: 'mypage'
};
