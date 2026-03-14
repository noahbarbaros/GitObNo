import "dotenv/config";
import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ── Config ──────────────────────────────────────────────────────────
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const ROOT_PAGE_ID = process.env.NOTION_ROOT_PAGE_ID;
const OUTPUT_DIR = process.env.OUTPUT_DIR || "./pulled-from-notion";

if (!NOTION_TOKEN || !ROOT_PAGE_ID) {
  console.error("Missing NOTION_TOKEN or NOTION_ROOT_PAGE_ID");
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });
const n2m = new NotionToMarkdown({ notionClient: notion });

// ── Helpers ─────────────────────────────────────────────────────────

/** Sanitize a page title into a safe filename */
function toFilename(title) {
  return title
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Get the plain-text title from a Notion page */
function getPageTitle(page) {
  const titleProp = Object.values(page.properties).find(
    (p) => p.type === "title"
  );
  if (!titleProp || !titleProp.title.length) return "Untitled";
  return titleProp.title.map((t) => t.plain_text).join("");
}

/** Recursively get all child pages under a parent block */
async function getChildPages(parentId) {
  const pages = [];
  let cursor;

  do {
    const response = await notion.blocks.children.list({
      block_id: parentId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of response.results) {
      if (block.type === "child_page") {
        pages.push({
          id: block.id,
          title: block.child_page.title,
        });
      }
    }

    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return pages;
}

// ── Main pull logic ─────────────────────────────────────────────────

async function pullPage(pageInfo) {
  const { id, title } = pageInfo;

  try {
    const mdBlocks = await n2m.pageToMarkdown(id);
    const mdString = n2m.toMarkdownString(mdBlocks);
    const content = typeof mdString === "string" ? mdString : mdString.parent;

    const filename = `${toFilename(title)}.md`;
    const filepath = join(OUTPUT_DIR, filename);

    writeFileSync(filepath, content, "utf-8");
    console.log(`  📄 Pulled: ${filename}`);
  } catch (err) {
    console.error(`  ❌ Failed to pull "${title}": ${err.message}`);
  }
}

async function main() {
  console.log("⬇️  Pulling pages from Notion...\n");

  // Ensure output directory exists
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const pages = await getChildPages(ROOT_PAGE_ID);

  if (pages.length === 0) {
    console.log("No child pages found under the root page.");
    return;
  }

  console.log(`Found ${pages.length} page(s) to pull:\n`);

  for (const page of pages) {
    await pullPage(page);
  }

  console.log(`\n✅ Pull complete. Files saved to: ${OUTPUT_DIR}`);
}

main();
