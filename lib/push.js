import { readFileSync, existsSync, statSync, readdirSync } from "fs";
import { basename, join, relative } from "path";
import { getClient } from "./notion-client.js";
import { mdToNotionBlocks } from "./markdown.js";

/** Find a child page by title under a parent */
async function findChildPage(parentId, title) {
  const notion = getClient();
  let cursor;
  do {
    const res = await notion.blocks.children.list({
      block_id: parentId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const block of res.results) {
      if (block.type === "child_page" && block.child_page.title === title) {
        return block.id;
      }
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return null;
}

/** Clear all blocks inside a page */
async function clearPage(pageId) {
  const notion = getClient();
  const children = await notion.blocks.children.list({
    block_id: pageId,
    page_size: 100,
  });
  for (const block of children.results) {
    await notion.blocks.delete({ block_id: block.id });
  }
}

/** Append blocks in batches of 100 */
async function appendBlocks(pageId, blocks) {
  const notion = getClient();
  for (let i = 0; i < blocks.length; i += 100) {
    await notion.blocks.children.append({
      block_id: pageId,
      children: blocks.slice(i, i + 100),
    });
  }
}

/** Push a single .md file to a Notion page */
export async function pushFile(filePath, parentPageId, { dryRun = false } = {}) {
  if (!existsSync(filePath)) {
    console.error(`  ✗ File not found: ${filePath}`);
    return;
  }

  const raw = readFileSync(filePath, "utf-8");
  const title = basename(filePath, ".md");
  const blocks = mdToNotionBlocks(raw);

  if (dryRun) {
    console.log(`  ~ [dry run] ${title} (${blocks.length} blocks)`);
    return;
  }

  const existingId = await findChildPage(parentPageId, title);
  const notion = getClient();

  if (existingId) {
    await clearPage(existingId);
    await appendBlocks(existingId, blocks);
    console.log(`  ✓ Updated: ${title}`);
  } else {
    const newPage = await notion.pages.create({
      parent: { page_id: parentPageId },
      properties: { title: [{ text: { content: title } }] },
      children: blocks.slice(0, 100),
    });
    if (blocks.length > 100) {
      await appendBlocks(newPage.id, blocks.slice(100));
    }
    console.log(`  ✓ Created: ${title}`);
  }
}

/** Push all .md files in a directory */
export async function pushDir(dirPath, parentPageId, { dryRun = false } = {}) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) {
    console.error(`  ✗ Not a directory: ${dirPath}`);
    return;
  }

  const files = collectMdFiles(dirPath);
  if (files.length === 0) {
    console.log("  No .md files found.");
    return;
  }

  console.log(`  Found ${files.length} file(s)\n`);

  for (const file of files) {
    try {
      await pushFile(file, parentPageId, { dryRun });
    } catch (err) {
      console.error(`  ✗ Failed: ${relative(dirPath, file)} — ${err.message}`);
    }
  }
}

function collectMdFiles(dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".obsidian", ".git", ".cache"].includes(entry.name)) continue;
      results.push(...collectMdFiles(full));
    } else if (entry.name.endsWith(".md")) {
      results.push(full);
    }
  }

  return results;
}
