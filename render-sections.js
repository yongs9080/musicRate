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
    const actionAttribute = section.actionKey
        ? `data-action="${section.actionKey}"`
        : `data-route="${section.targetPage}"`;

    return `
        <section class="content-card action-card">
            <button class="action mypage-action-link" type="button" ${actionAttribute}>${section.label}</button>
        </section>
    `;
}

function createProfileEditorSection(section) {
    const nameValue = section.nameValue || '';
    const imageValue = section.imageValue || '';
    const imagePreview = section.imagePreview || createCoverImage('PF');
    const cancelRoute = section.cancelRoute || 'mypage';

    return `
        <section class="content-card profile-editor-card">
            <h2>프로필 수정</h2>
            <p>이름과 프로필 사진을 변경할 수 있습니다.</p>
            <div class="profile-editor-form" data-profile-editor-form>
                <input type="hidden" value="${imageValue}" data-profile-image-input />
                <label class="profile-editor-field">
                    <span>이름</span>
                    <input
                        class="profile-editor-input"
                        type="text"
                        maxlength="40"
                        placeholder="표시할 이름"
                        value="${nameValue}"
                        data-profile-name-input
                    />
                </label>
                <label class="profile-editor-field">
                    <span>이미지 업로드</span>
                    <input
                        class="profile-editor-file-input"
                        type="file"
                        accept="image/*"
                        data-profile-image-file
                    />
                </label>
                <div class="profile-editor-preview-wrap">
                    <img class="profile-editor-preview" src="${imagePreview}" alt="프로필 미리보기" data-profile-image-preview />
                </div>
                <div class="profile-editor-actions">
                    <button class="action profile-editor-save" type="button" data-action="save-profile-editor">저장</button>
                    <button class="action profile-editor-cancel" type="button" data-route="${cancelRoute}">취소</button>
                </div>
            </div>
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

        if (section.type === 'profile-editor') {
            return createProfileEditorSection(section);
        }

        return createListSection(section);
    }).join('');
}
