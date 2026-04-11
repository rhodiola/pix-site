const IMAGE_BASE_URL = "https://img.npaso.com";
const GALLERY_STATE_KEY = "pix-gallery-state";

const state = {
    allImages: [],
    filteredImages: [],
    activeCategory: "all",
    searchText: "",
    sortOrder: "new"
};

const elements = {
    gallery: document.querySelector("[data-gallery]"),
    galleryEmpty: document.querySelector("[data-gallery-empty]"),
    search: document.querySelector("[data-search]"),
    sort: document.querySelector("[data-sort]"),
    tabs: Array.from(document.querySelectorAll("[data-category]")),
    currentCount: document.querySelector("[data-current-count]")
};

let masonryRenderToken = 0;
let resizeTimer = null;
let lastColumnCount = 0;

function escapeHtml(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function extractDateFromId(id = "") {
    const match = String(id).match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
    if (!match) {
        return { timestamp: 0 };
    }

    const [, y, m, d, hh, mm, ss] = match;
    return {
        timestamp: Number(`${y}${m}${d}${hh}${mm}${ss}`)
    };
}

function normalizeImage(image) {
    return {
        ...image,
        timestamp: extractDateFromId(image.id).timestamp
    };
}

function loadInitialImages() {
    const element = document.getElementById("initial-images");
    if (!element) return [];

    try {
        const parsed = JSON.parse(element.textContent || "[]");
        return Array.isArray(parsed) ? parsed.map(normalizeImage) : [];
    } catch (error) {
        console.error("initial-images parse failed:", error);
        return [];
    }
}

function getImageUrls(id) {
    return {
        thumb: `${IMAGE_BASE_URL}/thumb/${id}.webp`,
        viewer: `${IMAGE_BASE_URL}/viewer/${id}.webp`
    };
}

function getSearchTarget(image) {
    return [
        image.id,
        image.title,
        image.alt,
        ...(image.tags || []),
        ...(image.category || [])
    ]
        .join(" ")
        .toLowerCase();
}

function sortImages(images) {
    const items = [...images];

    items.sort((a, b) => {
        const aFeatured = a.featured ? 1 : 0;
        const bFeatured = b.featured ? 1 : 0;

        if (aFeatured !== bFeatured) {
            return bFeatured - aFeatured;
        }

        if (state.sortOrder === "old") {
            return a.timestamp - b.timestamp || String(a.id).localeCompare(String(b.id));
        }

        return b.timestamp - a.timestamp || String(b.id).localeCompare(String(a.id));
    });

    return items;
}

function filterImages() {
    const search = state.searchText.trim().toLowerCase();

    const items = state.allImages.filter((image) => {
        const matchesCategory =
            state.activeCategory === "all" ||
            (image.category || []).includes(state.activeCategory);

        const matchesSearch = !search || getSearchTarget(image).includes(search);

        return matchesCategory && matchesSearch;
    });

    state.filteredImages = sortImages(items);
}

function createCardHtml(image) {
    const urls = getImageUrls(image.id);

    return `
    <article class="card">
      <a href="./items/${encodeURIComponent(image.id)}/" class="card__link" aria-label="${escapeHtml(image.title || image.id)} の詳細ページへ">
        <div class="card__thumb">
          <img src="${urls.thumb}" alt="${escapeHtml(image.alt || image.title || image.id)}" loading="lazy" />
        </div>
        <div class="card__body">
          <h3 class="card__title">${escapeHtml(image.title || image.id)}</h3>
        </div>
      </a>
    </article>
  `;
}

function createCardElement(image) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = createCardHtml(image).trim();
    return wrapper.firstElementChild;
}



function getColumnCount() {
    const width = window.innerWidth;

    if (width <= 520) return 1;
    if (width <= 640) return 2;
    if (width <= 900) return 3;
    if (width <= 1180) return 4;
    return 5;
}

function createMasonryColumns(count) {
    const fragment = document.createDocumentFragment();
    const columns = [];

    for (let i = 0; i < count; i += 1) {
        const column = document.createElement("div");
        column.className = "gallery__column";
        column.dataset.columnIndex = String(i);
        columns.push(column);
        fragment.appendChild(column);
    }

    elements.gallery.innerHTML = "";
    elements.gallery.appendChild(fragment);

    return columns;
}

function getShortestColumn(columns) {
    return columns.reduce((shortest, current) => {
        if (!shortest) return current;
        return current.offsetHeight < shortest.offsetHeight ? current : shortest;
    }, null);
}

function waitForImagesInCard(card) {
    const images = Array.from(card.querySelectorAll("img"));

    if (images.length === 0) {
        return Promise.resolve();
    }

    return Promise.all(
        images.map((img) => new Promise((resolve) => {
            if (img.complete) {
                resolve();
                return;
            }

            const done = () => {
                img.removeEventListener("load", done);
                img.removeEventListener("error", done);
                resolve();
            };

            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
        }))
    );
}

async function renderGallery() {
    const token = ++masonryRenderToken;
    const items = [...state.filteredImages];

    elements.galleryEmpty.hidden = items.length > 0;
    elements.gallery.innerHTML = "";

    if (items.length === 0) {
        return;
    }

    const columnCount = getColumnCount();
    const columns = createMasonryColumns(columnCount);

    for (const image of items) {
        if (token !== masonryRenderToken) {
            return;
        }

        const card = createCardElement(image);
        await waitForImagesInCard(card);

        if (token !== masonryRenderToken) {
            return;
        }

        const targetColumn = getShortestColumn(columns) || columns[0];
        targetColumn.appendChild(card);
    }
}

function updateCurrentCount() {
    if (elements.currentCount) {
        elements.currentCount.textContent = `${state.allImages.length.toLocaleString("ja-JP")} images`;
    }
}

function refresh() {
    filterImages();
    renderGallery();
}

function setActiveTab(category) {
    elements.tabs.forEach((tab) => {
        tab.classList.toggle("is-active", tab.dataset.category === category);
    });
}

function saveGalleryState() {
    try {
        sessionStorage.setItem(
            GALLERY_STATE_KEY,
            JSON.stringify({
                activeCategory: state.activeCategory,
                searchText: state.searchText,
                sortOrder: state.sortOrder
            })
        );
    } catch (error) {
        console.warn("gallery state save failed:", error);
    }
}

function loadGalleryState() {
    try {
        const raw = sessionStorage.getItem(GALLERY_STATE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;

        return {
            activeCategory: typeof parsed.activeCategory === "string" ? parsed.activeCategory : "all",
            searchText: typeof parsed.searchText === "string" ? parsed.searchText : "",
            sortOrder: typeof parsed.sortOrder === "string" ? parsed.sortOrder : "new"
        };
    } catch (error) {
        console.warn("gallery state load failed:", error);
        return null;
    }
}

function applySavedState(savedState) {
    if (!savedState) return;

    state.activeCategory = savedState.activeCategory;
    state.searchText = savedState.searchText;
    state.sortOrder = savedState.sortOrder;

    if (elements.search) {
        elements.search.value = state.searchText;
    }

    if (elements.sort) {
        elements.sort.value = state.sortOrder;
    }

    setActiveTab(state.activeCategory);
}

function bindEvents() {
    elements.tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            state.activeCategory = tab.dataset.category || "all";
            setActiveTab(state.activeCategory);
            refresh();
            saveGalleryState();
        });
    });

    elements.search?.addEventListener("input", (event) => {
        state.searchText = event.target.value || "";
        refresh();
        saveGalleryState();
    });

    elements.sort?.addEventListener("change", (event) => {
        state.sortOrder = event.target.value || "new";
        refresh();
        saveGalleryState();
    });

    elements.gallery?.addEventListener("click", (event) => {
        const link = event.target.closest(".card__link");
        if (!link) return;
        saveGalleryState();
    });

    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            const nextColumnCount = getColumnCount();
            if (nextColumnCount === lastColumnCount) {
                return;
            }
            lastColumnCount = nextColumnCount;
            renderGallery();
        }, 120);
    });
}

function init() {
    state.allImages = loadInitialImages();
    updateCurrentCount();
    applySavedState(loadGalleryState());
    bindEvents();
    lastColumnCount = getColumnCount();
    refresh();
}

init();
