const contentDisplay = document.getElementById('content-display');
const tabButtons = document.querySelectorAll('button[data-tab]');

function createCoverImage(label) {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
            <rect width="160" height="160" rx="24" fill="#e9eefc" />
            <rect x="24" y="24" width="112" height="112" rx="18" fill="#4169e1" opacity="0.16" />
            <circle cx="80" cy="72" r="28" fill="#4169e1" opacity="0.85" />
            <path d="M64 96c12 10 22 14 32 14" stroke="#ffffff" stroke-width="8" stroke-linecap="round" />
            <text x="80" y="138" text-anchor="middle" font-size="18" font-family="Arial, sans-serif" fill="#1f2937">${label}</text>
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
            title: '음악 랭킹',
            layout: 'horizontal',
            items: [
                { title: 'New Skyline', artist: 'Ari', year: '2024', rating: '4.9', image: createCoverImage('NS') },
                { title: 'Velvet Night', artist: 'Rin', year: '2023', rating: '4.8', image: createCoverImage('VN') },
                { title: 'Ocean Light', artist: 'Jin', year: '2022', rating: '4.7', image: createCoverImage('OL') }
            ]
        },
        {
            type: 'list',
            title: '평점 높은 앨범',
            layout: 'horizontal',
            items: [
                { title: 'Golden Hour', artist: 'Sora', year: '2021', rating: '4.9', image: createCoverImage('GH') },
                { title: 'Neon Echo', artist: 'Kai', year: '2020', rating: '4.8', image: createCoverImage('NE') },
                { title: 'Moonlit Drive', artist: 'Dae', year: '2019', rating: '4.7', image: createCoverImage('MD') }
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
    search: [
        {
            type: 'search',
            title: '검색',
            description: '곡 제목 또는 아티스트를 입력해서 음악을 찾아보세요.',
            placeholder: '검색어를 입력하세요',
            buttonText: '검색',
            resultsText: '검색 결과가 여기에 표시됩니다.'
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

function createSearchSection(section) {
    return `
        <section class="content-card">
            <h2>${section.title}</h2>
            <p>${section.description}</p>
            <input type="text" id="search-input" placeholder="${section.placeholder}" />
            <button class="action" id="search-action">${section.buttonText}</button>
            <div id="search-results" class="content-card" style="margin-top: 18px;">
                <p>${section.resultsText}</p>
            </div>
        </section>
    `;
}

function renderSections(sections) {
    return sections.map((section) => {
        if (section.type === 'search') {
            return createSearchSection(section);
        }
        return createListSection(section);
    }).join('');
}

function setActiveTab(selectedTab) {
    tabButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === selectedTab);
    });
}

function renderPage(pageKey) {
    const pageSections = pages[pageKey] || pages.home;
    contentDisplay.innerHTML = renderSections(pageSections);
    setActiveTab(pageKey);

    if (pageKey === 'search') {
        const searchInput = document.getElementById('search-input');
        const searchAction = document.getElementById('search-action');
        const searchResults = document.getElementById('search-results');

        searchAction.addEventListener('click', () => {
            const query = searchInput.value.trim();
            searchResults.innerHTML = query
                ? `<p>“${query}” 검색 결과가 아직 준비 중입니다.</p>`
                : `<p>검색어를 입력해주세요.</p>`;
        });
    }
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