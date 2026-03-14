import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getClient } from "./notion-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, "..", ".cache");
const CACHE_FILE = join(CACHE_DIR, "pages.json");
const LINKS_FILE = join(CACHE_DIR, "links.json");

// ── Cache ───────────────────────────────────────────────────────────

function loadCache() {
  if (!existsSync(CACHE_FILE)) return { pages: [], updatedAt: null };
  return JSON.parse(readFileSync(CACHE_FILE, "utf-8"));
}

function saveCache(pages) {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(
    CACHE_FILE,
    JSON.stringify({ pages, updatedAt: new Date().toISOString() }, null, 2)
  );
}

function isCacheFresh(cache) {
  if (!cache.updatedAt) return false;
  const age = Date.now() - new Date(cache.updatedAt).getTime();
  return age < 5 * 60 * 1000; // 5 minutes
}

// ── Links (saved shortcuts) ─────────────────────────────────────────

export function loadLinks() {
  if (!existsSync(LINKS_FILE)) return {};
  return JSON.parse(readFileSync(LINKS_FILE, "utf-8"));
}

export function saveLink(name, pageId) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const links = loadLinks();
  links[name.toLowerCase()] = { name, pageId };
  writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2));
}

export function removeLink(name) {
  const links = loadLinks();
  delete links[name.toLowerCase()];
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2));
}

// ── Search Notion workspace ─────────────────────────────────────────

async function searchAllPages() {
  const notion = getClient();
  const allPages = [];
  let cursor;

  do {
    const response = await notion.search({
      filter: { property: "object", value: "page" },
      start_cursor: cursor,
      page_size: 100,
    });

    for (const page of response.results) {
      const title = extractTitle(page);
      if (title) {
        allPages.push({ id: page.id, title });
      }
    }

    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return allPages;
}

function extractTitle(page) {
  const titleProp = Object.values(page.properties).find(
    (p) => p.type === "title"
  );
  if (!titleProp || !titleProp.title.length) return null;
  return titleProp.title.map((t) => t.plain_text).join("");
}

// ── Fuzzy matching ──────────────────────────────────────────────────

function fuzzyScore(query, target) {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact match
  if (t === q) return 1000;

  // Starts with
  if (t.startsWith(q)) return 500 + (q.length / t.length) * 100;

  // Contains
  if (t.includes(q)) return 200 + (q.length / t.length) * 100;

  // Word match — any word in the target starts with the query
  const words = t.split(/\s+/);
  for (const word of words) {
    if (word.startsWith(q)) return 300 + (q.length / t.length) * 100;
  }

  // Subsequence match
  let qi = 0;
  let consecutive = 0;
  let maxConsecutive = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      consecutive++;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
    } else {
      consecutive = 0;
    }
  }
  if (qi === q.length) {
    return 50 + maxConsecutive * 10 + (q.length / t.length) * 20;
  }

  return 0;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Resolve a page name to a Notion page ID.
 * Checks saved links first, then fuzzy-searches the workspace.
 */
export async function resolvePage(query) {
  // 1. Check saved links
  const links = loadLinks();
  const linkKey = query.toLowerCase();
  if (links[linkKey]) {
    return links[linkKey];
  }

  // 2. Search with cache
  let cache = loadCache();
  if (!isCacheFresh(cache)) {
    const pages = await searchAllPages();
    saveCache(pages);
    cache = { pages };
  }

  // 3. Fuzzy match
  const scored = cache.pages
    .map((p) => ({ ...p, score: fuzzyScore(query, p.title) }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  // If top match is way ahead, use it. Otherwise return top matches for user to pick.
  return scored[0];
}

/**
 * Get all pages (for listing)
 */
export async function getAllPages(forceRefresh = false) {
  let cache = loadCache();
  if (forceRefresh || !isCacheFresh(cache)) {
    const pages = await searchAllPages();
    saveCache(pages);
    return pages;
  }
  return cache.pages;
}
