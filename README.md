# obsidian-notion-sync

> Push your Obsidian vault to Notion on every `git push`. Pull Notion pages back as clean Markdown.

---

## How it works

```
git push  →  GitHub Action  →  sync.js  →  Notion pages
                                  ↑
             @tryfabric/martian converts MD → Notion blocks
             (tables, callouts, code, headings all preserved)

npm run pull  →  pull.js  →  notion-to-md  →  .md files in your vault
```

- **Push** (automatic): every commit that touches `.md` files triggers the Action.
- **Pull** (manual): run `npm run pull` locally whenever you want Notion edits back.

---

## Setup

### 1. Notion integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) → **New integration**
2. Name it (e.g. `obsidian-sync`), select your workspace, hit **Submit**
3. Copy the **Internal Integration Token** → this is your `NOTION_TOKEN`
4. Open the Notion page you want as the sync root, click **⋯ → Add connections → obsidian-sync**
5. Copy the page ID from the URL:
   `https://notion.so/My-Notes-**abcdef1234567890abcdef1234567890**`

### 2. GitHub Secrets

In your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|---|---|
| `NOTION_TOKEN` | `secret_xxxx...` from step above |
| `NOTION_ROOT_PAGE_ID` | The 32-char page ID |

### 3. Add this folder to your vault repo

```bash
# In your vault root (which is a git repo):
git clone https://github.com/you/obsidian-notion-sync obsidian-notion-sync
# or just copy this folder in

cd obsidian-notion-sync
npm install
cp .env.example .env
# fill in .env for local pull usage
```

### 4. Commit and push

```bash
git add .
git commit -m "add notion sync"
git push
```

---

## Commands

```bash
# Sync only changed files (same as what the Action does)
npm run sync

# Force-sync ALL .md files
npm run sync:all

# Dry run — see what would sync without touching Notion
npm run sync:dry

# Pull all pages from Notion root back to ./pulled-from-notion/
npm run pull
```

For `pull`, set `OUTPUT_DIR` in `.env` to point directly at your vault folder.

