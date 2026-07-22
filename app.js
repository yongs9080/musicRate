import { pages, pageActiveTabMap } from './page-data.js';
import { renderSections } from './render-sections.js';

const contentDisplay = document.getElementById('content-display');
const tabButtons = document.querySelectorAll('button[data-tab]');
const searchPanel = document.getElementById('search-panel');
const tabSearch = document.getElementById('tab-search');

function setActiveTab(activeTab) {
    tabButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === activeTab);
    });
}

function renderPage(pageKey) {
    const pageSections = pages[pageKey] || pages.home;
    contentDisplay.innerHTML = renderSections(pageSections);
    setActiveTab(pageActiveTabMap[pageKey] || pageKey);
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
            if (tabSearch && searchPanel) {
                tabSearch.classList.add('hidden');
                searchPanel.classList.remove('hidden');
                searchPanel.focus();
            }
        } else {
            resetSearchTabState();
        }

        renderPage(selectedTab);
    });
});

contentDisplay.addEventListener('click', (event) => {
    const routeButton = event.target.closest('[data-route]');
    if (!routeButton) {
        return;
    }

    const targetPage = routeButton.dataset.route;
    if (targetPage && pages[targetPage]) {
        renderPage(targetPage);
    }
});

const logoLink = document.getElementById('logo-link');
if (logoLink) {
    logoLink.addEventListener('click', () => {
        resetSearchTabState();
        renderPage('home');
    });
    logoLink.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            resetSearchTabState();
            renderPage('home');
        }
    });
}
renderPage('home');