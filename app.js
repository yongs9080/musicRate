import { createAvatarImage, createCoverImage, pages, pageActiveTabMap } from './page-data.js';
import { renderRatingEditor, renderSections } from './render-sections.js';
import {
    beginGoogleLogin,
    deleteRatingByItemId,
    fetchCurrentUser,
    fetchMyRatings,
    fetchRatingsByItemIds,
    logoutCurrentUser,
    saveRating
} from './ratings-api.js';
import { searchSpotifyMedia, searchSpotifyMediaPage } from './spotify-api.js';

const contentDisplay = document.getElementById('content-display');
const tabButtons = document.querySelectorAll('button[data-tab]');
const searchPanel = document.getElementById('search-panel');
const tabSearch = document.getElementById('tab-search');
const authLoginButton = document.getElementById('auth-login-button');
const authLogoutButton = document.getElementById('auth-logout-button');
const authStatusMessage = document.getElementById('auth-status-message');
const authUserLabel = document.getElementById('auth-user-label');
let currentPageKey = 'home';
const HOME_RECOMMEND_SECTION_INDEX = 0;
const SEARCH_FILTER_SECTION_INDEX = 0;
const SEARCH_RESULTS_SECTION_INDEX = 1;
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE_SIZE = 10;
const DETAIL_HASH_PREFIX = 'detail/';
const MY_RATINGS_PAGE_SIZE = 20;
const MY_PAGE_RECENT_COUNT = 3;
let searchDebounceTimer = null;
let latestSearchRequestId = 0;
let currentSearchFilter = 'all';
let latestSearchResults = [];
let latestSearchRawResults = [];
let currentSearchTerm = '';
let isLoadingMoreSearchResults = false;
let searchSongOffset = 0;
let searchAlbumOffset = 0;
let searchHasMoreSongs = false;
let searchHasMoreAlbums = false;
let currentDetailItemId = null;
let currentDetailSourcePageKey = 'home';
let myRatingsByItemId = Object.create(null);
let currentUser = null;
let currentAuthMessage = '';

function isAuthenticated() {
    return Boolean(currentUser?.id);
}

function resetLocalRatingState() {
    myRatingsByItemId = Object.create(null);
    syncMyRatingsAcrossSources();
}

function updateAuthControls() {
    if (!authLoginButton || !authLogoutButton || !authUserLabel || !authStatusMessage) {
        return;
    }

    if (currentAuthMessage) {
        authStatusMessage.classList.remove('hidden');
        authStatusMessage.textContent = currentAuthMessage;
    } else {
        authStatusMessage.classList.add('hidden');
        authStatusMessage.textContent = '';
    }

    if (isAuthenticated()) {
        authLoginButton.classList.add('hidden');
        authLogoutButton.classList.remove('hidden');
        authUserLabel.classList.remove('hidden');
        authUserLabel.textContent = currentUser.displayName || currentUser.email || '로그인됨';
        return;
    }

    authLoginButton.classList.remove('hidden');
    authLogoutButton.classList.add('hidden');
    authUserLabel.classList.add('hidden');
    authUserLabel.textContent = '';
}

function consumeAuthMessageFromUrl() {
    if (typeof window === 'undefined') {
        return '';
    }

    const currentUrl = new URL(window.location.href);
    const authMessage = (currentUrl.searchParams.get('authMessage') || '').trim();
    if (!authMessage) {
        return '';
    }

    currentUrl.searchParams.delete('authMessage');
    currentUrl.searchParams.delete('authError');
    history.replaceState(history.state, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    return authMessage;
}

function applyAuthStateToRatingInputs() {
    const ratingInputs = contentDisplay.querySelectorAll('[data-rating-select]');
    ratingInputs.forEach((selectElement) => {
        const shouldDisable = !isAuthenticated();
        selectElement.disabled = shouldDisable;
        selectElement.title = shouldDisable ? 'Google 로그인 후 별점을 저장할 수 있습니다.' : '';
    });
}

function formatRatingValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(1) : '';
}

function getDisplayTypeLabel(itemType) {
    return itemType === 'album' ? '앨범' : '곡';
}

function getItemTypeFromMediaItem(item) {
    if (item?.itemType === 'album') {
        return 'album';
    }

    return item?.typeLabel === '앨범' ? 'album' : 'song';
}

function applyMyRatingToItem(item, targetItemIds = null) {
    if (!item?.id) {
        return;
    }

    if (targetItemIds && !targetItemIds.has(item.id)) {
        return;
    }

    const storedRating = myRatingsByItemId[item.id];
    item.myRating = typeof storedRating === 'number' ? formatRatingValue(storedRating) : undefined;
}

function syncMyRatingsAcrossSources(targetItemIds = null) {
    const itemIdSet = Array.isArray(targetItemIds) ? new Set(targetItemIds) : targetItemIds;

    Object.values(pages).forEach((sections) => {
        collectMediaItemsFromSections(sections).forEach((item) => applyMyRatingToItem(item, itemIdSet));
    });

    latestSearchRawResults.forEach((item) => applyMyRatingToItem(item, itemIdSet));
    latestSearchResults.forEach((item) => applyMyRatingToItem(item, itemIdSet));
}

function rerenderCurrentView() {
    if (currentPageKey === 'detail') {
        renderDetailPage(currentDetailItemId, currentDetailSourcePageKey);
        return;
    }

    renderPage(currentPageKey);
    if (currentPageKey === 'search') {
        renderSearchLoadMoreControl();
    }
}

function mapRatingRecordToMediaItem(record) {
    return {
        id: record.itemId,
        itemType: record.itemType,
        title: record.title || 'Untitled',
        artist: record.artist || 'Unknown',
        year: record.year || '-',
        rating: '-',
        myRating: formatRatingValue(record.rating),
        typeLabel: getDisplayTypeLabel(record.itemType),
        image: record.image || createCoverImage((record.title || 'NA').slice(0, 2).toUpperCase())
    };
}

function updateMyPageProfile() {
    const profileSection = pages.mypage?.[0];
    if (!profileSection) {
        return;
    }

    if (!isAuthenticated()) {
        profileSection.name = '게스트';
        profileSection.subtitle = 'Google 로그인 후 내 평점과 프로필을 확인할 수 있습니다.';
        profileSection.image = createAvatarImage('G');
        return;
    }

    const displayName = currentUser.displayName || currentUser.email || 'Music Rate User';
    profileSection.name = displayName;
    profileSection.subtitle = currentUser.email || 'Google 계정으로 로그인됨';
    profileSection.image = currentUser.avatarUrl || createAvatarImage(displayName);
}

function updateMyRatingsPageSections(items, total) {
    const myRatedMusicSection = pages.myRatedMusic?.[0];
    const myPageRecentSection = pages.mypage?.[2];

    if (!isAuthenticated()) {
        if (myRatedMusicSection) {
            myRatedMusicSection.items = [];
            myRatedMusicSection.description = 'Google 로그인 후 저장한 평점을 확인할 수 있습니다.';
        }

        if (myPageRecentSection) {
            myPageRecentSection.items = [];
            myPageRecentSection.description = '로그인 후 최근 평가한 음악이 표시됩니다.';
        }

        return;
    }

    if (myRatedMusicSection) {
        myRatedMusicSection.items = items;
        myRatedMusicSection.description = total
            ? `총 ${total}개의 평점을 저장했습니다.`
            : '아직 저장된 평점이 없습니다.';
    }

    if (myPageRecentSection) {
        const recentItems = items.slice(0, MY_PAGE_RECENT_COUNT);
        myPageRecentSection.items = recentItems;
        myPageRecentSection.description = recentItems.length
            ? `최근 ${recentItems.length}개의 평가입니다.`
            : '최근 평가가 아직 없습니다.';
    }
}

function setMyRatingsLoadingState() {
    if (pages.myRatedMusic?.[0]) {
        pages.myRatedMusic[0].description = '저장된 평점을 불러오는 중입니다.';
    }

    if (pages.mypage?.[2]) {
        pages.mypage[2].description = '저장된 최근 평점을 불러오는 중입니다.';
    }
}

async function refreshMyRatingsPageData(options = {}) {
    const { rerenderIfVisible = false, showLoading = false } = options;

    if (!isAuthenticated()) {
        updateMyPageProfile();
        updateMyRatingsPageSections([], 0);
        resetLocalRatingState();
        if (rerenderIfVisible && (currentPageKey === 'mypage' || currentPageKey === 'myRatedMusic')) {
            rerenderCurrentView();
        }
        return;
    }

    if (showLoading) {
        setMyRatingsLoadingState();
        if (rerenderIfVisible && (currentPageKey === 'mypage' || currentPageKey === 'myRatedMusic')) {
            rerenderCurrentView();
        }
    }

    try {
        const data = await fetchMyRatings({ limit: MY_RATINGS_PAGE_SIZE, offset: 0 });
        const items = Array.isArray(data?.items) ? data.items.map(mapRatingRecordToMediaItem) : [];

        myRatingsByItemId = Object.create(null);
        items.forEach((item) => {
            if (item.id && item.myRating) {
                myRatingsByItemId[item.id] = Number(item.myRating);
            }
        });

        updateMyPageProfile();
        updateMyRatingsPageSections(items, Number(data?.total) || 0);
        syncMyRatingsAcrossSources();

        if (rerenderIfVisible && (currentPageKey === 'mypage' || currentPageKey === 'myRatedMusic')) {
            rerenderCurrentView();
        }
    } catch (error) {
        console.error(error);

        if (pages.myRatedMusic?.[0]) {
            pages.myRatedMusic[0].description = '평점 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
        }

        if (pages.mypage?.[2]) {
            pages.mypage[2].description = '최근 평점을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
        }

        if (rerenderIfVisible && (currentPageKey === 'mypage' || currentPageKey === 'myRatedMusic')) {
            rerenderCurrentView();
        }
    }
}

async function hydrateRatingsForItemIds(itemIds, requestId = latestSearchRequestId) {
    const uniqueItemIds = Array.from(new Set(itemIds.filter(Boolean)));
    if (!uniqueItemIds.length) {
        return;
    }

    if (!isAuthenticated()) {
        uniqueItemIds.forEach((itemId) => {
            delete myRatingsByItemId[itemId];
        });
        syncMyRatingsAcrossSources(uniqueItemIds);
        return;
    }

    try {
        const data = await fetchRatingsByItemIds(uniqueItemIds);
        if (requestId !== latestSearchRequestId) {
            return;
        }

        const ratingsByItemId = data?.ratingsByItemId || {};
        uniqueItemIds.forEach((itemId) => {
            if (Object.prototype.hasOwnProperty.call(ratingsByItemId, itemId)) {
                myRatingsByItemId[itemId] = Number(ratingsByItemId[itemId]);
            } else {
                delete myRatingsByItemId[itemId];
            }
        });

        syncMyRatingsAcrossSources(uniqueItemIds);
        if (currentPageKey === 'search') {
            updateSearchResultsState(currentSearchTerm);
        }
    } catch (error) {
        console.error(error);
    }
}

async function submitRatingChange(itemId, ratingValue) {
    if (!isAuthenticated()) {
        window.alert('Google 로그인 후 별점을 저장할 수 있습니다.');
        beginGoogleLogin();
        return;
    }

    const mediaItem = findMediaItemById(itemId);
    if (!mediaItem) {
        return;
    }

    try {
        if (!ratingValue) {
            await deleteRatingByItemId(itemId);
            delete myRatingsByItemId[itemId];
        } else {
            const numericRating = Number(ratingValue);
            await saveRating({
                itemId,
                itemType: getItemTypeFromMediaItem(mediaItem),
                title: mediaItem.title,
                artist: mediaItem.artist,
                image: mediaItem.image,
                year: mediaItem.year === '-' ? '' : mediaItem.year,
                rating: numericRating
            });
            myRatingsByItemId[itemId] = numericRating;
        }

        syncMyRatingsAcrossSources([itemId]);
        rerenderCurrentView();
        await refreshMyRatingsPageData({ rerenderIfVisible: currentPageKey === 'mypage' || currentPageKey === 'myRatedMusic' });
    } catch (error) {
        console.error(error);
        window.alert(error instanceof Error ? error.message : '평점 저장 중 오류가 발생했습니다.');
        syncMyRatingsAcrossSources([itemId]);
        rerenderCurrentView();
    }
}

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
    syncMyRatingsAcrossSources();
    const pageSections = pages[resolvedPageKey] || pages.home;
    contentDisplay.innerHTML = renderSections(pageSections);
    applyAuthStateToRatingInputs();
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

    const officialRatingMarkup = mediaItem.rating && mediaItem.rating !== '-' ? `
        <div class="detail-meta-row">
            <span class="detail-meta-label">평점</span>
            <strong class="detail-meta-value">★ ${mediaItem.rating}</strong>
        </div>
    ` : '';

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
                <img class="detail-cover" src="${mediaItem.image || createCoverImage(mediaItem.title)}" alt="${mediaItem.title}" />
                <div class="detail-content">
                    <span class="detail-type">${mediaItem.typeLabel || '음악'}</span>
                    <h2>${mediaItem.title}</h2>
                    <p class="detail-artist">${mediaItem.artist}</p>
                    <div class="detail-meta-grid">
                        <div class="detail-meta-row">
                            <span class="detail-meta-label">발매 연도</span>
                            <strong class="detail-meta-value">${mediaItem.year || '-'}</strong>
                        </div>
                        ${officialRatingMarkup}
                        ${myRatingMarkup}
                    </div>
                    ${renderRatingEditor(mediaItem, 'detail-rating-editor')}
                </div>
            </div>
        </section>
    `;

    applyAuthStateToRatingInputs();
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
        return label === '곡';
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

function toPopularityNumber(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return 0;
    }

    return Math.floor(Math.min(Math.max(parsed, 0), 100));
}

function resetSearchPaginationState() {
    latestSearchRawResults = [];
    currentSearchTerm = '';
    isLoadingMoreSearchResults = false;
    searchSongOffset = 0;
    searchAlbumOffset = 0;
    searchHasMoreSongs = false;
    searchHasMoreAlbums = false;
}

function hasMoreSearchResults() {
    return searchHasMoreSongs || searchHasMoreAlbums;
}

function mergeMediaResults(existingItems, incomingItems) {
    const mergedMap = new Map();
    [...existingItems, ...incomingItems].forEach((item) => {
        if (!item?.id) {
            return;
        }

        if (!mergedMap.has(item.id)) {
            mergedMap.set(item.id, item);
        }
    });

    return Array.from(mergedMap.values());
}

function getSearchResultsCardElement() {
    const cards = Array.from(contentDisplay.querySelectorAll('.content-card'));
    return cards.find((card) => card.querySelector('h2')?.textContent?.trim() === '검색 결과') || null;
}

function renderSearchLoadMoreControl() {
    const existingWrap = contentDisplay.querySelector('.search-load-more-wrap');
    if (existingWrap) {
        existingWrap.remove();
    }

    if (currentPageKey !== 'search') {
        return;
    }

    if (!currentSearchTerm || !hasMoreSearchResults()) {
        return;
    }

    const resultsCard = getSearchResultsCardElement();
    if (!resultsCard) {
        return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'search-load-more-wrap';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'action search-load-more-button';
    button.dataset.searchLoadMore = 'true';
    button.disabled = isLoadingMoreSearchResults;
    button.textContent = isLoadingMoreSearchResults ? '불러오는 중...' : '더보기';

    wrap.appendChild(button);
    resultsCard.insertAdjacentElement('afterend', wrap);
}

function getTypeKey(item) {
    if (item?.typeLabel === '앨범') {
        return 'album';
    }

    if (item?.typeLabel === '곡') {
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

        const popularityDiff = toPopularityNumber(b.item?.popularity) - toPopularityNumber(a.item?.popularity);
        if (popularityDiff !== 0) {
            return popularityDiff;
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
        renderSearchLoadMoreControl();
    }
}

function updateSearchResultsState(term) {
    const results = postProcessResults(latestSearchRawResults, term, currentSearchFilter);
    latestSearchResults = results;

    if (!results.length) {
        setSearchSectionState({
            description: `'${term}' 검색 결과가 없습니다.`,
            items: []
        });
        rerenderIfCurrentPageIsSearch();
        return;
    }

    setSearchSectionState({
        description: `'${term}' 검색 결과 ${results.length}개 (음악/앨범 통합)`,
        items: results
    });
    rerenderIfCurrentPageIsSearch();
}

async function loadMoreSearchResults() {
    if (isLoadingMoreSearchResults || !currentSearchTerm || !hasMoreSearchResults()) {
        return;
    }

    const requestId = ++latestSearchRequestId;
    isLoadingMoreSearchResults = true;
    renderSearchLoadMoreControl();

    try {
        const searchTasks = [];

        if (searchHasMoreSongs) {
            searchTasks.push(searchSpotifyMediaPage({
                term: currentSearchTerm,
                entity: 'song',
                limit: SEARCH_PAGE_SIZE,
                offset: searchSongOffset
            }).then((result) => ({ entity: 'song', result })));
        }

        if (searchHasMoreAlbums) {
            searchTasks.push(searchSpotifyMediaPage({
                term: currentSearchTerm,
                entity: 'album',
                limit: SEARCH_PAGE_SIZE,
                offset: searchAlbumOffset
            }).then((result) => ({ entity: 'album', result })));
        }

        if (!searchTasks.length) {
            return;
        }

        const pageResults = await Promise.all(searchTasks);
        if (requestId !== latestSearchRequestId) {
            return;
        }

        pageResults.forEach(({ entity, result }) => {
            if (entity === 'song') {
                searchSongOffset = result.nextOffset;
                searchHasMoreSongs = result.hasMore;
            }

            if (entity === 'album') {
                searchAlbumOffset = result.nextOffset;
                searchHasMoreAlbums = result.hasMore;
            }

            latestSearchRawResults = mergeMediaResults(latestSearchRawResults, result.items);
        });

        updateSearchResultsState(currentSearchTerm);
        hydrateRatingsForItemIds(latestSearchRawResults.map((item) => item.id), requestId);
    } catch (error) {
        if (requestId !== latestSearchRequestId) {
            return;
        }

        console.error(error);
        setSearchSectionState({
            description: '추가 검색 결과를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
            items: latestSearchResults
        });
        rerenderIfCurrentPageIsSearch();
    } finally {
        if (requestId === latestSearchRequestId) {
            isLoadingMoreSearchResults = false;
            renderSearchLoadMoreControl();
        }
    }
}

async function searchAndRender(term) {
    const normalizedTerm = term.trim();

    if (!normalizedTerm) {
        resetSearchPaginationState();
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
        const [songPage, albumPage] = await Promise.all([
            searchSpotifyMediaPage({ term: normalizedTerm, entity: 'song', limit: SEARCH_PAGE_SIZE, offset: 0 }),
            searchSpotifyMediaPage({ term: normalizedTerm, entity: 'album', limit: SEARCH_PAGE_SIZE, offset: 0 })
        ]);
        if (requestId !== latestSearchRequestId) {
            return;
        }

        currentSearchTerm = normalizedTerm;
        searchSongOffset = songPage.nextOffset;
        searchAlbumOffset = albumPage.nextOffset;
        searchHasMoreSongs = songPage.hasMore;
        searchHasMoreAlbums = albumPage.hasMore;
        latestSearchRawResults = mergeMediaResults(songPage.items, albumPage.items);
        setSearchFilterState('all');
        updateSearchResultsState(normalizedTerm);
        hydrateRatingsForItemIds(latestSearchRawResults.map((item) => item.id), requestId);
    } catch (error) {
        if (requestId !== latestSearchRequestId) {
            return;
        }

        console.error(error);
        resetSearchPaginationState();
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
        syncMyRatingsAcrossSources();
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

    if (resolvedPageKey === 'mypage' || resolvedPageKey === 'myRatedMusic') {
        refreshMyRatingsPageData({ rerenderIfVisible: true, showLoading: true });
    }

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
            resetSearchPaginationState();
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
    if (event.target.closest('[data-rating-editor]')) {
        return;
    }

    const loadMoreButton = event.target.closest('[data-search-load-more]');
    if (loadMoreButton) {
        loadMoreSearchResults();
        return;
    }

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

contentDisplay.addEventListener('change', (event) => {
    const ratingSelect = event.target.closest('[data-rating-select]');
    if (!ratingSelect) {
        return;
    }

    submitRatingChange(ratingSelect.dataset.itemId, ratingSelect.value);
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

if (authLoginButton) {
    authLoginButton.addEventListener('click', () => {
        currentAuthMessage = '';
        updateAuthControls();
        beginGoogleLogin();
    });
}

if (authLogoutButton) {
    authLogoutButton.addEventListener('click', async () => {
        try {
            await logoutCurrentUser();
            currentUser = null;
            currentAuthMessage = '';
            updateAuthControls();
            await refreshMyRatingsPageData({ rerenderIfVisible: true });
            rerenderCurrentView();
        } catch (error) {
            console.error(error);
            window.alert(error instanceof Error ? error.message : '로그아웃 중 오류가 발생했습니다.');
        }
    });
}

async function refreshCurrentUserState(options = {}) {
    const { rerender = false } = options;

    try {
        const data = await fetchCurrentUser();
        currentUser = data?.authenticated ? data.user : null;
    } catch (error) {
        console.error(error);
        currentUser = null;
    }

    updateAuthControls();
    updateMyPageProfile();

    if (!isAuthenticated()) {
        resetLocalRatingState();
    }

    if (rerender) {
        rerenderCurrentView();
    }
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
updateAuthControls();
updateMyPageProfile();

async function initializeApp() {
    currentAuthMessage = consumeAuthMessageFromUrl();
    await refreshCurrentUserState({ rerender: true });
    await refreshMyRatingsPageData({ rerenderIfVisible: currentPageKey === 'mypage' || currentPageKey === 'myRatedMusic' });
    await hydrateHomeRecommendationsFromSpotify();
}

initializeApp();