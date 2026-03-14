import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { NotionToMarkdown } from "notion-to-md";
import { getClient } from "./notion-client.js";

function getN2M() {
  return new NotionToMarkdown({ notionClient: getClient() });
}

/** Get all child pages under a block */
async function getChildPages(parentId) {
  const notion = getClient();
  const pages = [];
  let cursor;

  do {
    const res = await notion.blocks.children.list({
      block_id: parentId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of res.results) {
      if (block.type === "child_page") {
        pages.push({ id: block.id, title: block.child_page.title });
      }
    }

    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);

  return pages;
}

function toFilename(title) {
  return title
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull a single page to markdown */
async function pullSinglePage(pageId, title, outputDir) {
  const n2m = getN2M();
  const mdBlocks = await n2m.pageToMarkdown(pageId);
  const mdString = n2m.toMarkdownString(mdBlocks);
  const content = typeof mdString === "string" ? mdString : mdString.parent;

  const filename = `${toFilename(title)}.md`;
  const filepath = join(outputDir, filename);
  writeFileSync(filepath, content, "utf-8");
  console.log(`  ✓ ${filename}`);
}

/**
 * Pull all child pages from a Notion page into a directory.
 */
export async function pullFromPage(pageId, outputDir) {
  mkdirSync(outputDir, { recursive: true });

  const children = await getChildPages(pageId);

  if (children.length === 0) {
    console.log("  No child pages. Pulling page content directly...\n");
    const notion = getClient();
    const page = await notion.pages.retrieve({ page_id: pageId });
    const titleProp = Object.values(page.properties).find(
      (p) => p.type === "title"
    );
    const title = titleProp?.title?.map((t) => t.plain_text).join("") || "Untitled";
    await pullSinglePage(pageId, title, outputDir);
    return;
  }

  console.log(`  Found ${children.length} page(s)\n`);

  for (const child of children) {
    try {
      await pullSinglePage(child.id, child.title, outputDir);
    } catch (err) {
      console.error(`  ✗ Failed: "${child.title}" — ${err.message}`);
    }
  }
}
