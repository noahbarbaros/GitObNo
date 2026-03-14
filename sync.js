import "dotenv/config";
import { Client } from "@notionhq/client";
import { markdownToBlocks } from "@tryfabric/martian";
import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { glob } from "glob";
import { basename, relative } from "path";
import matter from "gray-matter";

// ── Config ──────────────────────────────────────────────────────────
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const ROOT_PAGE_ID = process.env.NOTION_ROOT_PAGE_ID;
const VAULT_DIR = process.env.VAULT_DIR || ".";
const DRY_RUN = process.env.DRY_RUN === "true";
const SYNC_ALL = process.env.SYNC_ALL === "true";

if (!NOTION_TOKEN || !ROOT_PAGE_ID) {
  console.error("Missing NOTION_TOKEN or NOTION_ROOT_PAGE_ID");
  process.exit(1);
}

const notion = new Client({ auth: NOTION_TOKEN });

// ── Helpers ─────────────────────────────────────────────────────────

/** Get list of .md files changed in the last commit */
function getChangedFiles() {
  try {
    const diff = execSync("git diff HEAD~1 HEAD --name-only --diff-filter=ACMR", {
      encoding: "utf-8",
      cwd: VAULT_DIR,
    });
    return diff
      .split("\n")
      .filter((f) => f.endsWith(".md") && !f.startsWith("."));
  } catch {
    console.log("Could not get git diff (first commit?). Syncing all files.");
    return getAllMdFiles();
  }
}

/** Get all .md files in the vault */
function getAllMdFiles() {
  return glob.sync("**/*.md", {
    cwd: VAULT_DIR,
    ignore: ["node_modules/**", ".obsidian/**", "pulled-from-notion/**"],
  });
}

/** Strip YAML frontmatter and Obsidian-specific syntax */
function cleanMarkdown(raw) {
  // Strip frontmatter
  const { content } = matter(raw);

  return (
    content
      // Remove wikilink embeds: ![[something]]
      .replace(/!\[\[.*?\]\]/g, "")
      // Convert wikilinks [[Page]] or [[Page|Alias]] to plain text
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
  );
}

/** Convert Obsidian callouts to blockquotes with emoji prefix */
function convertCallouts(md) {
  const calloutMap = {
    NOTE: "📝 NOTE",
    TIP: "💡 TIP",
    IMPORTANT: "❗ IMPORTANT",
    WARNING: "⚠️ WARNING",
    CAUTION: "🔴 CAUTION",
    INFO: "ℹ️ INFO",
    EXAMPLE: "📖 EXAMPLE",
    QUESTION: "❓ QUESTION",
    BUG: "🐛 BUG",
    SUCCESS: "✅ SUCCESS",
    FAILURE: "❌ FAILURE",
    DANGER: "🔴 DANGER",
    ABSTRACT: "📋 ABSTRACT",
    TODO: "☑️ TODO",
    QUOTE: "💬 QUOTE",
  };

  return md.replace(
    /^> \[!(\w+)\](.*?)$/gm,
    (_, type, title) => {
      const upper = type.toUpperCase();
      const prefix = calloutMap[upper] || `📌 ${upper}`;
      const extra = title.trim() ? ` — ${title.trim()}` : "";
      return `> **${prefix}${extra}**`;
    }
  );
}

/** Find existing child page by title under a parent */
async function findPageByTitle(parentId, title) {
  const children = await notion.blocks.children.list({
    block_id: parentId,
    page_size: 100,
  });

  for (const block of children.results) {
    if (block.type === "child_page" && block.child_page.title === title) {
      return block.id;
    }
  }
  return null;
}

/** Delete all blocks inside a page (to replace content) */
async function clearPage(pageId) {
  const children = await notion.blocks.children.list({
    block_id: pageId,
    page_size: 100,
  });

  for (const block of children.results) {
    await notion.blocks.delete({ block_id: block.id });
  }
}

/** Append blocks to a page, batching to stay within Notion's 100-block limit */
async function appendBlocks(pageId, blocks) {
  const BATCH_SIZE = 100;
  for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
    const batch = blocks.slice(i, i + BATCH_SIZE);
    await notion.blocks.children.append({
      block_id: pageId,
      children: batch,
    });
  }
}

// ── Main sync logic ─────────────────────────────────────────────────

async function syncFile(filePath) {
  const fullPath = filePath.startsWith(VAULT_DIR)
    ? filePath
    : `${VAULT_DIR}/${filePath}`;

  if (!existsSync(fullPath)) {
    console.log(`  ⏭  Skipped (file not found): ${filePath}`);
    return;
  }

  const raw = readFileSync(fullPath, "utf-8");
  const title = basename(filePath, ".md");

  // Clean and convert
  let md = cleanMarkdown(raw);
  md = convertCallouts(md);

  // Convert MD → Notion blocks
  const blocks = markdownToBlocks(md);

  if (DRY_RUN) {
    console.log(`  🔍 [DRY RUN] Would sync: ${filePath} (${blocks.length} blocks)`);
    return;
  }

  // Check if page already exists
  const existingId = await findPageByTitle(ROOT_PAGE_ID, title);

  if (existingId) {
    // Update: clear and re-add content
    await clearPage(existingId);
    await appendBlocks(existingId, blocks);
    console.log(`  ✏️  Updated: ${title}`);
  } else {
    // Create new child page
    const newPage = await notion.pages.create({
      parent: { page_id: ROOT_PAGE_ID },
      properties: {
        title: [{ text: { content: title } }],
      },
      children: blocks.slice(0, 100), // Notion limits to 100 blocks on create
    });

    // Append remaining blocks if any
    if (blocks.length > 100) {
      await appendBlocks(newPage.id, blocks.slice(100));
    }
    console.log(`  ✅ Created: ${title}`);
  }
}

async function main() {
  console.log("🔄 Obsidian → Notion sync starting...\n");

  const files = SYNC_ALL ? getAllMdFiles() : getChangedFiles();

  if (files.length === 0) {
    console.log("No .md files to sync.");
    return;
  }

  console.log(`Found ${files.length} file(s) to sync:\n`);

  for (const file of files) {
    try {
      await syncFile(file);
    } catch (err) {
      console.error(`  ❌ Failed: ${file} — ${err.message}`);
    }
  }

  console.log("\n✅ Sync complete.");
}

main();
