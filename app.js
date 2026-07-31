import { pages, pageActiveTabMap } from './page-data.js';
import { renderSections } from './render-sections.js';
import { searchSpotifyMedia } from './spotify-api.js';

const contentDisplay = document.getElementById('content-display');
const tabButtons = document.querySelectorAll('button[data-tab]');
const searchPanel = document.getElementById('search-panel');
const tabSearch = document.getElementById('tab-search');
let currentPageKey = 'home';
const HOME_RECOMMEND_SECTION_INDEX = 0;
const SEARCH_FILTER_SECTION_INDEX = 0;
const SEARCH_RESULTS_SECTION_INDEX = 1;
const SEARCH_DEBOUNCE_MS = 300;
const DETAIL_HASH_PREFIX = 'detail/';
let searchDebounceTimer = null;
let latestSearchRequestId = 0;
let currentSearchFilter = 'all';
let latestSearchResults = [];
let currentDetailItemId = null;
let currentDetailSourcePageKey = 'home';

function getValidPageKey(pageKey) {
    return pages[pageKey] ? pageKey : 'home';
}

function setSearchPageState(pageKey, shouldFocus = false) {
    if (!searchPanel || !tabSearch) {
        return;
    }

    if (pageKey === 'search') {
        tabSearch.classList.add('hidden');
        searchPanel.classList.remove('hidden');
        if (shouldFocus) {
            searchPanel.focus();
        }
        return;
    }

    searchPanel.classList.add('hidden');
    tabSearch.classList.remove('hidden');
}

function setActiveTab(activeTab) {
    tabButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === activeTab);
    });
}

function renderPage(pageKey) {
    const resolvedPageKey = getValidPageKey(pageKey);
    const pageSections = pages[resolvedPageKey] || pages.home;
    contentDisplay.innerHTML = renderSections(pageSections);
    setActiveTab(pageActiveTabMap[resolvedPageKey] || resolvedPageKey);
    currentPageKey = resolvedPageKey;
    currentDetailItemId = null;
}

function collectMediaItemsFromSections(sections) {
    if (!Array.isArray(sections)) {
        return [];
    }

    return sections.flatMap((section) => {
        if (!Array.isArray(section?.items)) {
            return [];
        }

        return section.items.filter((item) => item && typeof item === 'object' && item.id);
    });
}

function findMediaItemById(itemId) {
    if (!itemId) {
        return null;
    }

    const staticItems = Object.values(pages).flatMap((sections) => collectMediaItemsFromSections(sections));
    const dynamicItems = latestSearchResults.filter((item) => item && typeof item === 'object' && item.id);
    const allItems = [...dynamicItems, ...staticItems];

    return allItems.find((item) => item.id === itemId) || null;
}

function renderDetailPage(itemId, sourcePageKey = currentPageKey) {
    const mediaItem = findMediaItemById(itemId);
    const resolvedSourcePageKey = getValidPageKey(sourcePageKey);

    if (!mediaItem) {
        contentDisplay.innerHTML = `
            <section class="content-card detail-card">
                <h2>상세 정보를 찾을 수 없습니다.</h2>
                <p>선택한 음악/앨범 정보를 다시 불러와 주세요.</p>
                <button class="action detail-back-button" type="button" data-route="${resolvedSourcePageKey}">이전 페이지로</button>
            </section>
        `;
        setActiveTab(pageActiveTabMap[resolvedSourcePageKey] || resolvedSourcePageKey);
        currentPageKey = 'detail';
        currentDetailItemId = null;
        currentDetailSourcePageKey = resolvedSourcePageKey;
        return;
    }

    const myRatingMarkup = mediaItem.myRating ? `
        <div class="detail-meta-row">
            <span class="detail-meta-label">내 평점</span>
            <strong class="detail-meta-value">★ ${mediaItem.myRating}</strong>
        </div>
    ` : '';

    contentDisplay.innerHTML = `
        <section class="content-card detail-card">
            <button class="detail-back-link" type="button" data-route="${resolvedSourcePageKey}">← 이전으로</button>
            <div class="detail-layout">
                <img class="detail-cover" src="${mediaItem.image || ''}" alt="${mediaItem.title}" />
                <div class="detail-content">
                    <span class="detail-type">${mediaItem.typeLabel || '음악'}</span>
                    <h2>${mediaItem.title}</h2>
                    <p class="detail-artist">${mediaItem.artist}</p>
                    <div class="detail-meta-grid">
                        <div class="detail-meta-row">
                            <span class="detail-meta-label">발매 연도</span>
                            <strong class="detail-meta-value">${mediaItem.year || '-'}</strong>
                        </div>
                        <div class="detail-meta-row">
                            <span class="detail-meta-label">평점</span>
                            <strong class="detail-meta-value">★ ${mediaItem.rating || '-'}</strong>
                        </div>
                        ${myRatingMarkup}
                    </div>
                </div>
            </div>
        </section>
    `;

    setActiveTab(pageActiveTabMap[resolvedSourcePageKey] || resolvedSourcePageKey);
    currentPageKey = 'detail';
    currentDetailItemId = itemId;
    currentDetailSourcePageKey = resolvedSourcePageKey;
}

function parseRouteFromHash(hashValue) {
    const normalizedHash = (hashValue || '').replace(/^#/, '').trim();

    if (!normalizedHash) {
        return { type: 'page', pageKey: 'home' };
    }

    if (normalizedHash.startsWith(DETAIL_HASH_PREFIX)) {
        return {
            type: 'detail',
            itemId: decodeURIComponent(normalizedHash.slice(DETAIL_HASH_PREFIX.length))
        };
    }

    return {
        type: 'page',
        pageKey: getValidPageKey(normalizedHash)
    };
}

function getHomeRecommendSection() {
    const homeSections = pages.home;
    if (!Array.isArray(homeSections) || !homeSections[HOME_RECOMMEND_SECTION_INDEX]) {
        return null;
    }

    return homeSections[HOME_RECOMMEND_SECTION_INDEX];
}

function updateHomeRecommendDescription(description) {
    const section = getHomeRecommendSection();
    if (!section) {
        return;
    }

    section.description = description;
}

function rerenderIfCurrentPageIsHome() {
    if (currentPageKey === 'home') {
        renderPage('home');
    }
}

function getSearchSection() {
    const searchSections = pages.search;
    if (!Array.isArray(searchSections) || !searchSections[SEARCH_RESULTS_SECTION_INDEX]) {
        return null;
    }

    return searchSections[SEARCH_RESULTS_SECTION_INDEX];
}

function getSearchFilterSection() {
    const searchSections = pages.search;
    if (!Array.isArray(searchSections) || !searchSections[SEARCH_FILTER_SECTION_INDEX]) {
        return null;
    }

    return searchSections[SEARCH_FILTER_SECTION_INDEX];
}

function isFilterMatch(item, filterKey) {
    if (filterKey === 'all') {
        return true;
    }

    const label = item?.typeLabel;
    if (filterKey === 'album') {
        return label === '앨범';
    }

    if (filterKey === 'song') {
        return label === '음악';
    }

    return true;
}

function normalizeSearchText(value) {
    return (value || '')
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenizeSearchText(value) {
    return normalizeSearchText(value).split(' ').filter(Boolean);
}

function toYearNumber(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function getTypeKey(item) {
    if (item?.typeLabel === '앨범') {
        return 'album';
    }

    if (item?.typeLabel === '음악') {
        return 'song';
    }

    return 'all';
}

function postProcessResults(searchResults, term, preferredFilter = 'all') {
    const normalizedTerm = normalizeSearchText(term);
    const tokens = tokenizeSearchText(term);
    const shouldApplyHardFilter = normalizedTerm.length >= 2;

    const scoredResults = searchResults.map((item, index) => {
        const title = normalizeSearchText(item?.title);
        const artist = normalizeSearchText(item?.artist);
        let score = 0;

        if (normalizedTerm && title === normalizedTerm) {
            score += 120;
        } else if (normalizedTerm && title.startsWith(normalizedTerm)) {
            score += 70;
        } else if (normalizedTerm && title.includes(normalizedTerm)) {
            score += 45;
        }

        if (normalizedTerm && artist === normalizedTerm) {
            score += 140;
        } else if (normalizedTerm && artist.startsWith(normalizedTerm)) {
            score += 90;
        } else if (normalizedTerm && artist.includes(normalizedTerm)) {
            score += 60;
        }

        let matchedTokenCount = 0;
        tokens.forEach((token) => {
            if (title.includes(token)) {
                score += 18;
                matchedTokenCount += 1;
            }

            if (artist.includes(token)) {
                score += 10;
                matchedTokenCount += 1;
            }
        });

        const typeKey = getTypeKey(item);
        if (preferredFilter !== 'all' && typeKey === preferredFilter) {
            score += 15;
        }

        if (!item?.image) {
            score -= 3;
        }

        return {
            item,
            score,
            matchedTokenCount,
            index
        };
    }).filter(({ item, matchedTokenCount, score }) => {
        if (!shouldApplyHardFilter) {
            return true;
        }

        if (score <= 0) {
            return false;
        }

        if (matchedTokenCount > 0) {
            return true;
        }

        const title = normalizeSearchText(item?.title);
        const artist = normalizeSearchText(item?.artist);
        return title.includes(normalizedTerm) || artist.includes(normalizedTerm);
    });

    scoredResults.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }

        return a.index - b.index;
    });

    return scoredResults.map(({ item }) => item);
}

function setSearchFilterState(filterKey) {
    const normalizedFilter = ['all', 'album', 'song'].includes(filterKey) ? filterKey : 'all';
    currentSearchFilter = normalizedFilter;

    const filterSection = getSearchFilterSection();
    if (filterSection) {
        filterSection.activeFilter = normalizedFilter;
    }
}

function setSearchSectionState({ description, items = [] }) {
    const section = getSearchSection();
    if (!section) {
        return;
    }

    section.layout = 'horizontal';
    section.description = description;
    section.items = items.filter((item) => isFilterMatch(item, currentSearchFilter));
}

function rerenderIfCurrentPageIsSearch() {
    if (currentPageKey === 'search') {
        renderPage('search');
    }
}

async function searchAndRender(term) {
    const normalizedTerm = term.trim();

    if (!normalizedTerm) {
        latestSearchResults = [];
        setSearchFilterState('all');
        setSearchSectionState({
            description: '검색어를 입력하면 결과가 표시됩니다.',
            items: []
        });
        rerenderIfCurrentPageIsSearch();
        return;
    }

    const requestId = ++latestSearchRequestId;

    setSearchSectionState({
        description: `'${normalizedTerm}' 검색 중입니다...`,
        items: []
    });
    navigateToPage('search', { pushHistory: false, focusSearch: true });

    try {
        const [songResults, albumResults] = await Promise.all([
            searchSpotifyMedia({ term: normalizedTerm, entity: 'song', limit: 10 }),
            searchSpotifyMedia({ term: normalizedTerm, entity: 'album', limit: 10 })
        ]);
        if (requestId !== latestSearchRequestId) {
            return;
        }

        const mergedMap = new Map();
        [...songResults, ...albumResults].forEach((item) => {
            if (!mergedMap.has(item.id)) {
                mergedMap.set(item.id, item);
            }
        });
        const mergedResults = Array.from(mergedMap.values());
        const results = postProcessResults(mergedResults, normalizedTerm, currentSearchFilter);
        latestSearchResults = results;
        setSearchFilterState('all');

        if (!results.length) {
            setSearchSectionState({
                description: `'${normalizedTerm}' 검색 결과가 없습니다.`,
                items: []
            });
            rerenderIfCurrentPageIsSearch();
            return;
        }

        setSearchSectionState({
            description: `'${normalizedTerm}' 검색 결과 ${results.length}개 (음악/앨범 통합)`,
            items: results
        });
        rerenderIfCurrentPageIsSearch();
    } catch (error) {
        if (requestId !== latestSearchRequestId) {
            return;
        }

        console.error(error);
        latestSearchResults = [];
        setSearchFilterState('all');
        setSearchSectionState({
            description: '검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
            items: []
        });
        rerenderIfCurrentPageIsSearch();
    }
}

async function hydrateHomeRecommendationsFromSpotify() {
    const section = getHomeRecommendSection();
    if (!section) {
        return;
    }

    updateHomeRecommendDescription('Spotify 추천 데이터를 불러오는 중입니다.');
    rerenderIfCurrentPageIsHome();

    try {
        const recommendedItems = await searchSpotifyMedia({ term: 'kpop', entity: 'song', limit: 10 });

        if (!recommendedItems.length) {
            updateHomeRecommendDescription('Spotify에서 결과를 찾지 못해 기본 추천 목록을 표시합니다.');
            rerenderIfCurrentPageIsHome();
            return;
        }

        section.items = recommendedItems;
        updateHomeRecommendDescription('Spotify 기반 실시간 추천 목록입니다.');
        rerenderIfCurrentPageIsHome();
    } catch (error) {
        console.error(error);
        updateHomeRecommendDescription('Spotify 연결에 실패해 기본 추천 목록을 표시합니다.');
        rerenderIfCurrentPageIsHome();
    }
}

function navigateToPage(pageKey, options = {}) {
    const { pushHistory = true, focusSearch = false } = options;
    const resolvedPageKey = getValidPageKey(pageKey);

    if (pushHistory && resolvedPageKey === currentPageKey) {
        setSearchPageState(resolvedPageKey, focusSearch);
        return;
    }

    setSearchPageState(resolvedPageKey, focusSearch);
    renderPage(resolvedPageKey);

    if (pushHistory) {
        history.pushState({ pageKey: resolvedPageKey }, '', `#${resolvedPageKey}`);
    }
}

function navigateToDetail(itemId, options = {}) {
    const { pushHistory = true, sourcePageKey = currentPageKey } = options;
    const resolvedSourcePageKey = getValidPageKey(sourcePageKey);

    setSearchPageState('detail', false);
    renderDetailPage(itemId, resolvedSourcePageKey);

    if (pushHistory) {
        const encodedId = encodeURIComponent(itemId || '');
        history.pushState({ pageKey: 'detail', itemId, sourcePageKey: resolvedSourcePageKey }, '', `#${DETAIL_HASH_PREFIX}${encodedId}`);
    }
}

function resetSearchTabState() {
    if (searchPanel && tabSearch) {
        searchPanel.classList.add('hidden');
        tabSearch.classList.remove('hidden');
    }
}

tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
        const selectedTab = button.dataset.tab;

        if (selectedTab === 'search') {
            navigateToPage(selectedTab, { pushHistory: true, focusSearch: true });

            if (searchPanel) {
                const term = searchPanel.value.trim();
                if (term) {
                    searchAndRender(term);
                } else {
                    setSearchSectionState({
                        description: '검색어를 입력하면 결과가 표시됩니다.',
                        items: []
                    });
                    rerenderIfCurrentPageIsSearch();
                }
            }
            return;
        }

        navigateToPage(selectedTab, { pushHistory: true });
    });
});

if (searchPanel) {
    searchPanel.addEventListener('input', () => {
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
        }

        const term = searchPanel.value.trim();
        if (!term) {
            latestSearchRequestId += 1;
            setSearchSectionState({
                description: '검색어를 입력하면 결과가 표시됩니다.',
                items: []
            });
            rerenderIfCurrentPageIsSearch();
            return;
        }

        searchDebounceTimer = setTimeout(() => {
            searchAndRender(term);
        }, SEARCH_DEBOUNCE_MS);
    });

    searchPanel.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') {
            return;
        }

        event.preventDefault();
        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
        }

        searchAndRender(searchPanel.value);
    });
}

contentDisplay.addEventListener('click', (event) => {
    const filterButton = event.target.closest('[data-search-filter]');
    if (filterButton) {
        const filterKey = filterButton.dataset.searchFilter;
        setSearchFilterState(filterKey);
        setSearchSectionState({
            description: getSearchSection()?.description || '검색 결과',
            items: latestSearchResults
        });
        rerenderIfCurrentPageIsSearch();
        return;
    }

    const mediaCard = event.target.closest('.content-card-item[data-item-id]');
    if (mediaCard) {
        const itemId = mediaCard.dataset.itemId;
        if (itemId) {
            const sourcePageKey = currentPageKey === 'detail' ? currentDetailSourcePageKey : currentPageKey;
            navigateToDetail(itemId, { pushHistory: true, sourcePageKey });
        }
        return;
    }

    const routeButton = event.target.closest('[data-route]');
    if (!routeButton) {
        return;
    }

    const targetPage = routeButton.dataset.route;
    if (targetPage && pages[targetPage]) {
        navigateToPage(targetPage, { pushHistory: true });
    }
});

contentDisplay.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
        return;
    }

    const mediaCard = event.target.closest('.content-card-item[data-item-id]');
    if (!mediaCard) {
        return;
    }

    event.preventDefault();
    const itemId = mediaCard.dataset.itemId;
    if (!itemId) {
        return;
    }

    const sourcePageKey = currentPageKey === 'detail' ? currentDetailSourcePageKey : currentPageKey;
    navigateToDetail(itemId, { pushHistory: true, sourcePageKey });
});

const logoLink = document.getElementById('logo-link');
if (logoLink) {
    logoLink.addEventListener('click', () => {
        navigateToPage('home', { pushHistory: true });
    });
    logoLink.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            navigateToPage('home', { pushHistory: true });
        }
    });
}

window.addEventListener('popstate', (event) => {
    const routeFromHash = parseRouteFromHash(window.location.hash);
    const statePageKey = event.state?.pageKey;

    if (statePageKey === 'detail' || routeFromHash.type === 'detail') {
        const itemId = event.state?.itemId || routeFromHash.itemId;
        const sourcePageKey = event.state?.sourcePageKey || currentDetailSourcePageKey || 'home';
        navigateToDetail(itemId, { pushHistory: false, sourcePageKey });
        return;
    }

    navigateToPage(statePageKey || routeFromHash.pageKey || 'home', { pushHistory: false });
});

const initialRoute = parseRouteFromHash(window.location.hash);
if (initialRoute.type === 'detail') {
    navigateToDetail(initialRoute.itemId, { pushHistory: false, sourcePageKey: 'home' });
    history.replaceState({ pageKey: 'detail', itemId: initialRoute.itemId, sourcePageKey: 'home' }, '', window.location.hash || '#home');
} else {
    const initialPageKey = getValidPageKey(initialRoute.pageKey);
    navigateToPage(initialPageKey, { pushHistory: false });
    history.replaceState({ pageKey: initialPageKey }, '', `#${initialPageKey}`);
}
hydrateHomeRecommendationsFromSpotify();