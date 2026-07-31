import { pages, pageActiveTabMap } from './page-data.js';
import { renderSections } from './render-sections.js';
import { searchItunesMedia } from './itunes-api.js';

const contentDisplay = document.getElementById('content-display');
const tabButtons = document.querySelectorAll('button[data-tab]');
const searchPanel = document.getElementById('search-panel');
const tabSearch = document.getElementById('tab-search');
let currentPageKey = 'home';
const HOME_RECOMMEND_SECTION_INDEX = 0;
const SEARCH_FILTER_SECTION_INDEX = 0;
const SEARCH_RESULTS_SECTION_INDEX = 1;
const SEARCH_DEBOUNCE_MS = 300;
let searchDebounceTimer = null;
let latestSearchRequestId = 0;
let currentSearchFilter = 'all';
let latestSearchResults = [];

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
            searchItunesMedia({ term: normalizedTerm, entity: 'song', limit: 20 }),
            searchItunesMedia({ term: normalizedTerm, entity: 'album', limit: 20 })
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
        const results = Array.from(mergedMap.values());
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

async function hydrateHomeRecommendationsFromItunes() {
    const section = getHomeRecommendSection();
    if (!section) {
        return;
    }

    updateHomeRecommendDescription('iTunes 추천 데이터를 불러오는 중입니다.');
    rerenderIfCurrentPageIsHome();

    try {
        const recommendedItems = await searchItunesMedia({ term: 'kpop', entity: 'song', limit: 10 });

        if (!recommendedItems.length) {
            updateHomeRecommendDescription('iTunes에서 결과를 찾지 못해 기본 추천 목록을 표시합니다.');
            rerenderIfCurrentPageIsHome();
            return;
        }

        section.items = recommendedItems;
        updateHomeRecommendDescription('iTunes 기반 실시간 추천 목록입니다.');
        rerenderIfCurrentPageIsHome();
    } catch (error) {
        console.error(error);
        updateHomeRecommendDescription('iTunes 연결에 실패해 기본 추천 목록을 표시합니다.');
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

    const routeButton = event.target.closest('[data-route]');
    if (!routeButton) {
        return;
    }

    const targetPage = routeButton.dataset.route;
    if (targetPage && pages[targetPage]) {
        navigateToPage(targetPage, { pushHistory: true });
    }
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
    const statePageKey = event.state?.pageKey;
    const hashPageKey = window.location.hash.replace('#', '');
    navigateToPage(statePageKey || hashPageKey || 'home', { pushHistory: false });
});

const initialPageKey = getValidPageKey(window.location.hash.replace('#', ''));
navigateToPage(initialPageKey, { pushHistory: false });
history.replaceState({ pageKey: initialPageKey }, '', `#${initialPageKey}`);
hydrateHomeRecommendationsFromItunes();