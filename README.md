# Obsidian Blob Upload

An Obsidian plugin that uploads pasted and dropped images to Vercel Blob Storage, inserting live URLs instead of saving files locally. Keeps your vault free of binary attachments.

## Features

- **Paste upload** — screenshot or copied image pastes upload automatically
- **Drop upload** — drag files from Finder/Explorer into the editor
- **Blob explorer** — sidebar panel showing all uploaded files in a collapsible folder tree with copy URL, copy markdown, and delete actions. Click any file to open it in the browser. Drag and drop files onto the panel to upload, or drop directly onto a folder to upload into that path.
- **Context menu** — right-click a local image reference (`![[image.png]]`) to upload it
- **Batch upload** — command to upload all local image references in the current note
- **File picker** — command to upload files via a system file dialog
- **Deterministic URLs** — no random suffixes, pathnames mirror your vault folder structure

## Build

```sh
npm install
npm run build
```

This outputs `main.js` into the repo root. The easiest setup is to symlink the repo as your plugin directory:

```sh
ln -s /path/to/obsidian-blob-upload /path/to/vault/.obsidian/plugins/obsidian-blob-upload
```

Or copy the three required files manually:

```sh
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/obsidian-blob-upload/
```

For development with auto-rebuild on changes:

```sh
npm run dev
```

## Install

1. Build the plugin (see above)
2. Add `"obsidian-blob-upload"` to your vault's `.obsidian/community-plugins.json`
3. Reload Obsidian
4. Enable "Blob Upload" in Settings > Community Plugins
5. Go to Settings > Blob Upload and enter your `BLOB_READ_WRITE_TOKEN`

The token is stored in `.obsidian/plugins/obsidian-blob-upload/data.json`, which is gitignored by default.

## Settings

| Setting | Description | Default |
|---|---|---|
| Blob read/write token | Your `BLOB_READ_WRITE_TOKEN` from Vercel | — |
| Base path prefix | Prefix for blob pathnames (e.g. `assets`) | `assets` |
| Auto-upload on paste | Upload images automatically on paste | `true` |
| Auto-upload on drop | Upload images automatically on drop | `true` |
| Slugify filenames | Lowercase, strip diacritics, replace spaces with hyphens | `true` |
| Allow overwrite | Overwrite existing blobs with the same pathname | `true` |
| Max file size (MB) | Reject files larger than this | `50` |

## How it works

The plugin uses Obsidian's `requestUrl` to call the Vercel Blob REST API directly, bypassing CORS restrictions in Electron. The `@vercel/blob` SDK isn't used because it relies on `fetch` which fails cross-origin in this environment.

**Upload flow:**
1. Intercept paste/drop event, prevent Obsidian's default local-attachment behavior
2. Insert a `![Uploading ...]()` placeholder at the cursor
3. Slugify the filename and build a pathname from the vault folder structure
4. `PUT` the file to `blob.vercel-storage.com/{pathname}` with the token
5. Replace the placeholder with `![filename](blob-url)`

**Blob explorer:** A sidebar view (cloud icon in ribbon, or command palette) that lists all blobs under your configured prefix as a collapsible folder tree. Each file shows its size and has actions to copy the URL, copy as markdown, or delete. Click a file to open it in the browser. You can also drag files from your OS directly onto the explorer panel to upload — drop onto a specific folder to upload into that path, or drop on the background to upload to the root prefix.

## Structure

```
src/
  main.ts           Plugin lifecycle, paste/drop interception, commands
  settings.ts       Settings tab UI
  uploader.ts       Vercel Blob REST API client (upload, list, delete)
  utils.ts          slugify, MIME detection, pathname builder
  blob-explorer.ts  Sidebar file tree view
manifest.json
styles.css
esbuild.config.mjs
```
