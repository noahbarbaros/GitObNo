import { Client } from "@notionhq/client";

let _client = null;

export function getClient() {
  if (!_client) {
    const token = process.env.NOTION_TOKEN;
    if (!token) {
      console.error("Missing NOTION_TOKEN. Set it in .env or export it.");
      process.exit(1);
    }
    _client = new Client({ auth: token });
  }
  return _client;
}
