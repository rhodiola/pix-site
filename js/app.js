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

    let items = state.allImages.filter((image) => {
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

function renderGallery() {
    elements.gallery.innerHTML = state.filteredImages.map(createCardHtml).join("");
    elements.galleryEmpty.hidden = state.filteredImages.length > 0;
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
}

function init() {
    state.allImages = loadInitialImages();
    updateCurrentCount();
    applySavedState(loadGalleryState());
    bindEvents();
    refresh();
}

init();