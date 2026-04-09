const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, "data", "images.json");
const INDEX_TEMPLATE_FILE = path.join(ROOT, "build", "templates", "index.template.html");
const ITEM_TEMPLATE_FILE = path.join(ROOT, "build", "templates", "item.template.html");

const OUTPUT_INDEX_FILE = path.join(ROOT, "index.html");
const OUTPUT_ITEMS_DIR = path.join(ROOT, "items");
const OUTPUT_SITEMAP_FILE = path.join(ROOT, "sitemap.xml");
const OUTPUT_ROBOTS_FILE = path.join(ROOT, "robots.txt");

const SITE_ORIGIN = "https://pix.npaso.com";
const IMAGE_BASE_URL = "https://img.npaso.com";

const CATEGORY_LABELS = {
    all: "All",
    wallpaper: "Wallpapers",
    poster: "Posters",
    background: "Backgrounds"
};

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function readText(filePath) {
    return fs.readFileSync(filePath, "utf8");
}

function writeText(filePath, content) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, content, "utf8");
}

function escapeHtml(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttribute(value = "") {
    return escapeHtml(value).replace(/`/g, "&#096;");
}

function escapeScriptJson(value = "") {
    return String(value)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
}

function replaceToken(template, token, value) {
    return template.replace(new RegExp(`__${token}__`, "g"), value);
}

function extractDateFromId(id = "") {
    const match = String(id).match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);

    if (!match) {
        return {
            isoDate: "",
            timestamp: 0
        };
    }

    const [, y, m, d, hh, mm, ss] = match;
    return {
        isoDate: `${y}-${m}-${d}`,
        timestamp: Number(`${y}${m}${d}${hh}${mm}${ss}`)
    };
}

function normalizeImage(image) {
    const dateInfo = extractDateFromId(image.id);

    return {
        ...image,
        title: (image.title || image.id || "").trim(),
        alt: (image.alt || image.title || image.id || "").trim(),
        tags: Array.isArray(image.tags) ? image.tags : [],
        category: Array.isArray(image.category) && image.category.length > 0 ? image.category : ["wallpaper"],
        featured: Boolean(image.featured),
        date: dateInfo.isoDate,
        timestamp: dateInfo.timestamp
    };
}

function getImageUrls(id) {
    return {
        thumb: `${IMAGE_BASE_URL}/thumb/${id}.webp`,
        viewer: `${IMAGE_BASE_URL}/viewer/${id}.webp`,
        download: `${IMAGE_BASE_URL}/download/${id}.webp`
    };
}

function sortImages(images, sortOrder = "new") {
    const items = [...images];

    items.sort((a, b) => {
        const aFeatured = a.featured ? 1 : 0;
        const bFeatured = b.featured ? 1 : 0;

        if (aFeatured !== bFeatured) {
            return bFeatured - aFeatured;
        }

        if (sortOrder === "old") {
            return a.timestamp - b.timestamp || String(a.id).localeCompare(String(b.id));
        }

        return b.timestamp - a.timestamp || String(b.id).localeCompare(String(a.id));
    });

    return items;
}

function createCategoryFilters(images) {
    const categories = new Set(["all"]);
    images.forEach((image) => {
        (image.category || []).forEach((category) => categories.add(category));
    });

    return [...categories]
        .map((category) => {
            const label = CATEGORY_LABELS[category] || category;
            const activeClass = category === "all" ? " is-active" : "";
            return `<button class="tab${activeClass}" type="button" data-category="${escapeAttribute(category)}">${escapeHtml(label)}</button>`;
        })
        .join("");
}

function createCardHtml(image) {
    const urls = getImageUrls(image.id);

    return `
    <article class="card">
      <a href="./items/${encodeURIComponent(image.id)}/" class="card__link" aria-label="${escapeAttribute(image.title)} の詳細ページへ">
        <div class="card__thumb">
          <img src="${escapeAttribute(urls.thumb)}" alt="${escapeAttribute(image.alt)}" loading="lazy" />
        </div>
        <div class="card__body">
          <h3 class="card__title">${escapeHtml(image.title)}</h3>
        </div>
      </a>
    </article>
  `;
}

function buildIndexHtml(images) {
    let template = readText(INDEX_TEMPLATE_FILE);
    const sorted = sortImages(images, "new");
    const initialGalleryHtml = sorted.map(createCardHtml).join("");
    const categoryFilters = createCategoryFilters(images);
    const initialJson = escapeScriptJson(JSON.stringify(sorted));

    template = replaceToken(template, "CURRENT_COUNT", escapeHtml(`${images.length.toLocaleString("ja-JP")} images`));
    template = replaceToken(template, "CATEGORY_FILTERS", categoryFilters);
    template = replaceToken(template, "INITIAL_GALLERY", initialGalleryHtml);
    template = replaceToken(template, "INITIAL_IMAGES_JSON", initialJson);

    return template;
}

function buildItemHtml(image) {
    let template = readText(ITEM_TEMPLATE_FILE);
    const urls = getImageUrls(image.id);

    template = replaceToken(template, "PAGE_TITLE", escapeHtml(`${image.title} | pix.npaso.com`));
    template = replaceToken(template, "META_DESCRIPTION", escapeAttribute(image.alt || image.title));
    template = replaceToken(template, "ITEM_ID", escapeAttribute(image.id));
    template = replaceToken(template, "VIEWER_IMAGE_URL", escapeAttribute(urls.viewer));
    template = replaceToken(template, "IMAGE_ALT", escapeAttribute(image.alt));
    template = replaceToken(template, "TITLE", escapeHtml(image.title));
    template = replaceToken(template, "DISPLAY_DESCRIPTION", escapeHtml(image.alt));
    template = replaceToken(template, "TAGS", "");

    return template;
}

function buildSitemapXml(images) {
    const latestImageDate = images.reduce((latest, image) => {
        if (!image.date) return latest;
        return !latest || image.date > latest ? image.date : latest;
    }, "");

    const urls = [
        { loc: `${SITE_ORIGIN}/`, lastmod: latestImageDate },
        ...images.map((image) => ({
            loc: `${SITE_ORIGIN}/items/${encodeURIComponent(image.id)}/`,
            lastmod: image.date || ""
        }))
    ];

    const body = urls
        .map(({ loc, lastmod }) => {
            const lastmodTag = lastmod ? `\n    <lastmod>${escapeHtml(lastmod)}</lastmod>` : "";
            return `  <url>\n    <loc>${escapeHtml(loc)}</loc>${lastmodTag}\n  </url>`;
        })
        .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

function buildRobotsTxt() {
    return `User-agent: *
Allow: /

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;
}

function main() {
    if (!fs.existsSync(DATA_FILE)) {
        throw new Error(`images.json が見つかりません: ${DATA_FILE}`);
    }

    const raw = readText(DATA_FILE);
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
        throw new Error("images.json の形式が正しくありません。配列が必要です。");
    }

    const images = parsed.map(normalizeImage);
    const sortedForOutput = sortImages(images, "new");

    writeText(OUTPUT_INDEX_FILE, buildIndexHtml(images));
    writeText(OUTPUT_SITEMAP_FILE, buildSitemapXml(images));
    writeText(OUTPUT_ROBOTS_FILE, buildRobotsTxt());

    fs.rmSync(OUTPUT_ITEMS_DIR, { recursive: true, force: true });
    ensureDir(OUTPUT_ITEMS_DIR);

    sortedForOutput.forEach((image) => {
        const outputDir = path.join(OUTPUT_ITEMS_DIR, image.id);
        writeText(path.join(outputDir, "index.html"), buildItemHtml(image));
    });

    console.log(`build complete: ${images.length} items`);
}

main();