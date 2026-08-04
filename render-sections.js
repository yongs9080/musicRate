import { createCoverImage } from './page-data.js';

const RATING_OPTIONS = Array.from({ length: 10 }, (_, index) => ((index + 1) / 2).toFixed(1));

export function renderRatingEditor(item, className = '') {
    if (!item?.id) {
        return '';
    }

    const currentValue = item.myRating ? Number(item.myRating).toFixed(1) : '';
    const optionsMarkup = [`<option value="">선택 안 함</option>`]
        .concat(RATING_OPTIONS.map((value) => `<option value="${value}"${currentValue === value ? ' selected' : ''}>${value}</option>`))
        .join('');
    const editorClassName = className ? `rating-editor ${className}` : 'rating-editor';

    return `
        <label class="${editorClassName}" data-rating-editor>
            <span class="rating-editor-label">내 평점</span>
            <select class="rating-select" data-rating-select data-item-id="${item.id}">
                ${optionsMarkup}
            </select>
        </label>
    `;
}

function createListSection(section) {
    const listClass = section.layout === 'horizontal' ? 'content-list horizontal-list' : 'content-list';
    const sectionItems = Array.isArray(section.items) ? section.items : [];
    const itemsMarkup = sectionItems.map((item) => {
        if (section.layout === 'horizontal' && typeof item === 'object') {
            const ratingMarkup = item.rating && item.rating !== '-' ? `<div class="item-rating">★ ${item.rating}</div>` : '';
            const myRatingMarkup = item.myRating ? `<div class="item-my-rating">내 평점 ★ ${item.myRating}</div>` : '';
            const ratingsMarkup = ratingMarkup || myRatingMarkup ? `
                <div class="item-ratings">
                    ${ratingMarkup}
                    ${myRatingMarkup}
                </div>
            ` : '';

            return `
                <li class="content-card-item" data-item-id="${item.id || ''}" role="button" tabindex="0" aria-label="${item.title} 상세 보기">
                    <div class="item-cover-wrap">
                        <img class="item-cover" src="${item.image || createCoverImage(item.title)}" alt="${item.title}" />
                        <span class="item-type-badge">${item.typeLabel || '음악'}</span>
                    </div>
                    <div class="item-details">
                        <strong>${item.title}</strong>
                        <span>${item.artist}</span>
                        <span>${item.year}</span>
                    </div>
                    ${ratingsMarkup}
                    <div class="item-rating-editor-wrap">
                        ${renderRatingEditor(item)}
                    </div>
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

function createProfileSection(section) {
    return `
        <section class="content-card profile-card">
            <div class="profile-header">
                <img class="profile-avatar" src="${section.image}" alt="${section.name} 프로필 사진" />
                <div class="profile-meta">
                    <h2>${section.name}</h2>
                    <p>${section.subtitle || ''}</p>
                </div>
            </div>
        </section>
    `;
}

function createActionSection(section) {
    return `
        <section class="content-card action-card">
            <button class="action mypage-action-link" type="button" data-route="${section.targetPage}">${section.label}</button>
        </section>
    `;
}

function createSearchFilterSection(section) {
    const options = Array.isArray(section.options) ? section.options : [];
    const buttonsMarkup = options.map((option) => {
        const activeClass = section.activeFilter === option.key ? ' active' : '';
        return `<button class="search-filter-button${activeClass}" type="button" data-search-filter="${option.key}">${option.label}</button>`;
    }).join('');

    return `
        <section class="content-card search-filter-card">
            <div class="search-filter-bar">${buttonsMarkup}</div>
        </section>
    `;
}

export function renderSections(sectionsData) {
    return sectionsData.map((section) => {
        if (section.type === 'profile') {
            return createProfileSection(section);
        }

        if (section.type === 'action') {
            return createActionSection(section);
        }

        if (section.type === 'search-filter') {
            return createSearchFilterSection(section);
        }

        return createListSection(section);
    }).join('');
}
