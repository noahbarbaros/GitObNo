import matter from "gray-matter";
import { markdownToBlocks } from "@tryfabric/martian";

const CALLOUT_MAP = {
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

/** Strip YAML frontmatter and Obsidian-specific syntax */
export function cleanMarkdown(raw) {
  const { content } = matter(raw);

  return (
    content
      // Remove wikilink embeds: ![[something]]
      .replace(/!\[\[.*?\]\]/g, "")
      // Convert wikilinks [[Page|Alias]] to plain text
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
  );
}

/** Convert Obsidian callouts to blockquotes with emoji prefix */
export function convertCallouts(md) {
  return md.replace(/^> \[!(\w+)\](.*?)$/gm, (_, type, title) => {
    const upper = type.toUpperCase();
    const prefix = CALLOUT_MAP[upper] || `📌 ${upper}`;
    const extra = title.trim() ? ` — ${title.trim()}` : "";
    return `> **${prefix}${extra}**`;
  });
}

/** Full pipeline: raw MD string → Notion blocks */
export function mdToNotionBlocks(raw) {
  let md = cleanMarkdown(raw);
  md = convertCallouts(md);
  return markdownToBlocks(md);
}
