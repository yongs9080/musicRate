const contentDisplay = document.getElementById('content-display');
const tabButtons = document.querySelectorAll('button[data-tab]');

const pages = {
    home: `
        <section class="content-card">
            <h2>홈</h2>
            <p>음악 평점을 관리하고 새로운 곡을 확인할 수 있습니다.</p>
            <ul class="song-list">
                <li>좋아하는 곡 보기</li>
                <li>최근 평가한 음악</li>
                <li>추천 플레이리스트</li>
            </ul>
        </section>
    `,
    search: `
        <section class="content-card">
            <h2>검색</h2>
            <p>곡 제목 또는 아티스트를 입력해서 음악을 찾아보세요.</p>
            <input type="text" id="search-input" placeholder="검색어를 입력하세요" />
            <button class="action" id="search-action">검색</button>
            <div id="search-results" class="content-card" style="margin-top: 18px;">
                <p>검색 결과가 여기에 표시됩니다.</p>
            </div>
        </section>
    `,
    mypage: `
        <section class="content-card">
            <h2>마이페이지</h2>
            <p>내 평점과 즐겨찾기를 확인합니다.</p>
            <ul class="song-list">
                <li>내가 평가한 곡 12개</li>
                <li>좋아요한 곡 8개</li>
                <li>최근 방문한 플레이리스트</li>
            </ul>
        </section>
    `
};

function setActiveTab(selectedTab) {
    tabButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === selectedTab);
    });
}

function renderPage(pageKey) {
    const pageHtml = pages[pageKey] || pages.home;
    contentDisplay.innerHTML = pageHtml;
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