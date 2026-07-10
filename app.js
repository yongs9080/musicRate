const contentDisplay = document.getElementById('content-display');
const tabButtons = document.querySelectorAll('button[data-tab]');

function createCoverImage(labelText) {
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

const pages = {
    home: [
        {
            type: 'list',
            title: '추천 음악/앨범',
            layout: 'horizontal',
            items: [
                { title: 'Midnight Echo', artist: 'Nova', year: '2024', rating: '4.8', image: createCoverImage('ME') },
                { title: 'Summer Rain', artist: 'Lina', year: '2023', rating: '4.7', image: createCoverImage('SR') },
                { title: 'Blue Horizon', artist: 'Mio', year: '2022', rating: '4.9', image: createCoverImage('BH') }
            ]
        },
        {
            type: 'list',
            title: '최근 평가',
            layout: 'horizontal',
            items: [
                { title: '아리아', artist: 'Eun', year: '2024', rating: '5.0', image: createCoverImage('AR') },
                { title: 'Winter Bloom', artist: 'Mina', year: '2023', rating: '4.8', image: createCoverImage('WB') },
                { title: 'Sparkle', artist: 'Noah', year: '2022', rating: '4.6', image: createCoverImage('SP') }
            ]
        }
    ],
    genre: [
        {
            type: 'list',
            title: '장르별 추천',
            description: '장르를 기준으로 음악을 탐색해보세요.',
            items: ['팝', '재즈', '락', '랩', '클래식']
        }
    ],
    review: [
        {
            type: 'list',
            title: '최근 리뷰',
            description: '사용자 리뷰와 평점이 표시됩니다.',
            items: ['새 앨범 리뷰', '인디 음악 추천', '평점 높은 곡 소개']
        }
    ],
    community: [
        {
            type: 'list',
            title: '커뮤니티',
            description: '다른 유저와 음악 이야기를 나눠보세요.',
            items: ['최신 토론', '추천 음악 공유', '좋아요한 리뷰 보기']
        }
    ],
    search: [
        {
            type: 'list',
            title: '검색 결과',
            description: '검색어에 대한 음악을 확인하세요.',
            items: []
        }
    ],
    mypage: [
        {
            type: 'list',
            title: '마이페이지',
            description: '내 평점과 즐겨찾기를 확인합니다.',
            items: ['내가 평가한 곡 12개', '좋아요한 곡 8개', '최근 방문한 플레이리스트']
        }
    ]
};

function createListSection(section) {
    const listClass = section.layout === 'horizontal' ? 'content-list horizontal-list' : 'content-list';
    const itemsMarkup = section.items.map((item) => {
        if (section.layout === 'horizontal' && typeof item === 'object') {
            return `
                <li class="content-card-item">
                    <img class="item-cover" src="${item.image || createCoverImage(item.title)}" alt="${item.title}" />
                    <div class="item-details">
                        <strong>${item.title}</strong>
                        <span>${item.artist}</span>
                        <span>${item.year}</span>
                    </div>
                    <div class="item-rating">★ ${item.rating}</div>
                </li>
            `;
        }

        return `<li>${typeof item === 'string' ? item : item.title}</li>`;
    }).join('');
    const descriptionMarkup = section.description ? `<p>${section.description}</p>` : '';

    return `
        <section class="content-card">
            <h2>${section.title}</h2>
            ${descriptionMarkup}
            <ul class="${listClass}">${itemsMarkup}</ul>
        </section>
    `;
}

function renderSections(sectionsData) {
    return sectionsData.map((section) => createListSection(section)).join('');
}

function setActiveTab(activeTab) {
    tabButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === activeTab);
    });
}

function renderPage(pageKey) {
    const pageSections = pages[pageKey] || pages.home;
    contentDisplay.innerHTML = renderSections(pageSections);
    setActiveTab(pageKey);
}

tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
        renderPage(button.dataset.tab);
    });
});

const logoLink = document.getElementById('logo-link');
if (logoLink) {
    logoLink.addEventListener('click', () => {
        renderPage('home');
    });
    logoLink.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            renderPage('home');
        }
    });
}

renderPage('home');