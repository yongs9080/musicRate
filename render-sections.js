import { createCoverImage } from './page-data.js';

function createListSection(section) {
    const listClass = section.layout === 'horizontal' ? 'content-list horizontal-list' : 'content-list';
    const sectionItems = Array.isArray(section.items) ? section.items : [];
    const itemsMarkup = sectionItems.map((item) => {
        if (section.layout === 'horizontal' && typeof item === 'object') {
            return `
                <li class="content-card-item" data-item-id="${item.id || ''}">
                    <div class="item-cover-wrap">
                        <img class="item-cover" src="${item.image || createCoverImage(item.title)}" alt="${item.title}" />
                        <span class="item-type-badge">${item.typeLabel || '음악'}</span>
                    </div>
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

export function renderSections(sectionsData) {
    return sectionsData.map((section) => {
        if (section.type === 'profile') {
            return createProfileSection(section);
        }

        if (section.type === 'action') {
            return createActionSection(section);
        }

        return createListSection(section);
    }).join('');
}
