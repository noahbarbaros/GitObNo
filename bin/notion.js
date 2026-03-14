#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { resolve } from "path";
import { statSync } from "fs";
import { resolvePage, getAllPages, saveLink, removeLink, loadLinks } from "../lib/resolver.js";
import { pushFile, pushDir } from "../lib/push.js";
import { pullFromPage } from "../lib/pull.js";

const program = new Command();

program
  .name("notion")
  .description("Obsidian ↔ Notion sync CLI")
  .version("1.0.0");

// ── notion push ─────────────────────────────────────────────────────

program
  .command("push")
  .description("Push markdown file(s) to a Notion page")
  .argument("<page>", "Notion page name (fuzzy matched)")
  .argument("[path]", "File or folder to push", ".")
  .option("--dry-run", "Preview what would be synced without pushing")
  .action(async (pageName, targetPath, opts) => {
    const page = await resolvePage(pageName);
    if (!page) {
      console.error(`\n  ✗ No Notion page found matching "${pageName}"\n`);
      console.error(`  Run \`notion pages\` to see available pages.\n`);
      process.exit(1);
    }

    console.log(`\n  → Pushing to "${page.title}" (${page.id})\n`);

    const fullPath = resolve(targetPath);

    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        await pushDir(fullPath, page.id, { dryRun: opts.dryRun });
      } else {
        await pushFile(fullPath, page.id, { dryRun: opts.dryRun });
      }
    } catch (err) {
      if (err.code === "ENOENT") {
        console.error(`  ✗ Path not found: ${targetPath}`);
        process.exit(1);
      }
      throw err;
    }

    console.log("\n  Done.\n");
  });

// ── notion pull ─────────────────────────────────────────────────────

program
  .command("pull")
  .description("Pull a Notion page (and its children) as markdown")
  .argument("<page>", "Notion page name (fuzzy matched)")
  .option("-o, --output <dir>", "Output directory", process.env.OUTPUT_DIR || "./pulled-from-notion")
  .action(async (pageName, opts) => {
    const page = await resolvePage(pageName);
    if (!page) {
      console.error(`\n  ✗ No Notion page found matching "${pageName}"\n`);
      process.exit(1);
    }

    console.log(`\n  ← Pulling from "${page.title}"\n`);

    await pullFromPage(page.id, resolve(opts.output));

    console.log(`\n  Done. Files saved to: ${opts.output}\n`);
  });

// ── notion pages ────────────────────────────────────────────────────

program
  .command("pages")
  .description("List all Notion pages in your workspace")
  .option("--refresh", "Force refresh the page cache")
  .action(async (opts) => {
    console.log("\n  Fetching pages...\n");

    const pages = await getAllPages(opts.refresh);

    if (pages.length === 0) {
      console.log("  No pages found. Make sure your integration is connected.\n");
      return;
    }

    const maxTitle = Math.min(
      60,
      Math.max(...pages.map((p) => p.title.length))
    );

    for (const page of pages) {
      const title = page.title.padEnd(maxTitle);
      const shortId = page.id.replace(/-/g, "").slice(0, 12) + "…";
      console.log(`  ${title}  ${shortId}`);
    }

    console.log(`\n  ${pages.length} page(s) total\n`);
  });

// ── notion link ─────────────────────────────────────────────────────

program
  .command("link")
  .description("Save a page shortcut for quick access")
  .argument("<name>", "Shortcut name")
  .argument("[page-name]", "Notion page to link (searches workspace)")
  .option("--id <pageId>", "Link directly to a page ID")
  .option("--remove", "Remove a saved link")
  .action(async (name, pageName, opts) => {
    if (opts.remove) {
      removeLink(name);
      console.log(`\n  ✓ Removed link "${name}"\n`);
      return;
    }

    if (opts.id) {
      saveLink(name, opts.id);
      console.log(`\n  ✓ Linked "${name}" → ${opts.id}\n`);
      return;
    }

    if (!pageName) {
      console.error("\n  Provide a page name to search, or use --id <pageId>\n");
      process.exit(1);
    }

    const page = await resolvePage(pageName);
    if (!page) {
      console.error(`\n  ✗ No page found matching "${pageName}"\n`);
      process.exit(1);
    }

    saveLink(name, page.id);
    console.log(`\n  ✓ Linked "${name}" → "${page.title}" (${page.id})\n`);
  });

// ── notion links ────────────────────────────────────────────────────

program
  .command("links")
  .description("Show all saved page shortcuts")
  .action(() => {
    const links = loadLinks();
    const entries = Object.values(links);

    if (entries.length === 0) {
      console.log("\n  No saved links. Use `notion link <name> <page>` to create one.\n");
      return;
    }

    console.log("\n  Saved links:\n");
    for (const { name, pageId } of entries) {
      console.log(`  ${name.padEnd(20)}  →  ${pageId}`);
    }
    console.log();
  });

program.parse();
