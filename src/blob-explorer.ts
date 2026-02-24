import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type BlobUploadPlugin from "./main";
import { BlobEntry, listBlobs, deleteBlob } from "./uploader";

export const BLOB_EXPLORER_VIEW = "blob-explorer-view";

interface TreeFolder {
	name: string;
	children: TreeFolder[];
	files: BlobEntry[];
}

function buildTree(blobs: BlobEntry[]): TreeFolder {
	const root: TreeFolder = { name: "", children: [], files: [] };

	for (const blob of blobs) {
		const parts = blob.pathname.split("/");
		const filename = parts.pop()!;
		let current = root;

		for (const part of parts) {
			let child = current.children.find((c) => c.name === part);
			if (!child) {
				child = { name: part, children: [], files: [] };
				current.children.push(child);
			}
			current = child;
		}

		current.files.push(blob);
	}

	// Sort folders and files alphabetically
	const sortTree = (node: TreeFolder) => {
		node.children.sort((a, b) => a.name.localeCompare(b.name));
		node.files.sort((a, b) => a.pathname.localeCompare(b.pathname));
		node.children.forEach(sortTree);
	};
	sortTree(root);

	return root;
}

function countFiles(node: TreeFolder): number {
	return (
		node.files.length +
		node.children.reduce((sum, c) => sum + countFiles(c), 0)
	);
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function totalSize(blobs: BlobEntry[]): number {
	return blobs.reduce((sum, b) => sum + b.size, 0);
}

export class BlobExplorerView extends ItemView {
	plugin: BlobUploadPlugin;
	private blobs: BlobEntry[] = [];
	private refreshBtn: HTMLButtonElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: BlobUploadPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return BLOB_EXPLORER_VIEW;
	}

	getDisplayText(): string {
		return "Blob Storage";
	}

	getIcon(): string {
		return "cloud";
	}

	async onOpen() {
		this.render();
		await this.refresh();
	}

	async onClose() {
		this.contentEl.empty();
	}

	private render() {
		const container = this.contentEl;
		container.empty();
		container.addClass("blob-explorer-container");

		// Header
		const header = container.createDiv("blob-explorer-header");
		header.createSpan({ cls: "blob-explorer-title", text: "Blob Storage" });

		const actions = header.createDiv("blob-explorer-actions");
		this.refreshBtn = actions.createEl("button", { attr: { "aria-label": "Refresh" } });
		setIcon(this.refreshBtn, "refresh-cw");
		this.refreshBtn.addEventListener("click", () => this.refresh());

		// Tree area
		container.createDiv("blob-explorer-tree");

		// Stats footer
		container.createDiv("blob-explorer-stats");
	}

	async refresh() {
		if (!this.plugin.settings.token) {
			this.showEmpty("Configure your Blob token in settings");
			return;
		}

		this.showLoading();

		try {
			this.blobs = await listBlobs(
				this.plugin.settings,
				this.plugin.settings.basePathPrefix || undefined,
			);
			this.renderTree();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.showEmpty(`Failed to load: ${msg}`);
		}
	}

	private showLoading() {
		this.refreshBtn?.addClass("is-loading");
		const tree = this.contentEl.querySelector(".blob-explorer-tree");
		if (tree) {
			tree.empty();
			(tree as HTMLElement).createDiv({
				cls: "blob-explorer-loading",
				text: "Loading...",
			});
		}
	}

	private showEmpty(message: string) {
		this.refreshBtn?.removeClass("is-loading");
		const tree = this.contentEl.querySelector(".blob-explorer-tree");
		if (tree) {
			tree.empty();
			(tree as HTMLElement).createDiv({
				cls: "blob-explorer-empty",
				text: message,
			});
		}
		const stats = this.contentEl.querySelector(".blob-explorer-stats");
		if (stats) (stats as HTMLElement).setText("");
	}

	private renderTree() {
		this.refreshBtn?.removeClass("is-loading");

		const treeEl = this.contentEl.querySelector(".blob-explorer-tree") as HTMLElement;
		if (!treeEl) return;
		treeEl.empty();

		if (this.blobs.length === 0) {
			treeEl.createDiv({
				cls: "blob-explorer-empty",
				text: "No blobs found",
			});
			return;
		}

		const root = buildTree(this.blobs);

		// If root has a single child folder (like "assets"), render its children directly
		if (root.children.length === 1 && root.files.length === 0) {
			const topFolder = root.children[0];
			this.renderFolder(treeEl, topFolder, 0, true);
		} else {
			for (const folder of root.children) {
				this.renderFolder(treeEl, folder, 0);
			}
			for (const file of root.files) {
				this.renderFile(treeEl, file, 0);
			}
		}

		// Stats
		const stats = this.contentEl.querySelector(".blob-explorer-stats") as HTMLElement;
		if (stats) {
			stats.setText(
				`${this.blobs.length} files — ${formatSize(totalSize(this.blobs))}`,
			);
		}
	}

	private renderFolder(
		parent: HTMLElement,
		folder: TreeFolder,
		depth: number,
		startExpanded = false,
	) {
		const el = parent.createDiv("blob-folder");
		if (!startExpanded) el.addClass("is-collapsed");

		const header = el.createDiv("blob-folder-header");
		header.style.setProperty("--indent", String(depth));

		const icon = header.createDiv("blob-folder-icon");
		setIcon(icon, "chevron-down");

		header.createSpan({ cls: "blob-folder-name", text: folder.name });
		header.createSpan({
			cls: "blob-folder-count",
			text: String(countFiles(folder)),
		});

		header.addEventListener("click", () => {
			el.toggleClass("is-collapsed", !el.hasClass("is-collapsed"));
		});

		const children = el.createDiv("blob-folder-children");

		for (const child of folder.children) {
			this.renderFolder(children, child, depth + 1);
		}
		for (const file of folder.files) {
			this.renderFile(children, file, depth + 1);
		}
	}

	private renderFile(parent: HTMLElement, blob: BlobEntry, depth: number) {
		const el = parent.createDiv("blob-file");
		el.style.setProperty("--indent", String(depth));

		const icon = el.createDiv("blob-file-icon");
		setIcon(icon, this.getFileIcon(blob.pathname));

		const filename = blob.pathname.split("/").pop() ?? blob.pathname;
		el.createSpan({ cls: "blob-file-name", text: filename });
		el.createSpan({ cls: "blob-file-size", text: formatSize(blob.size) });

		el.addEventListener("click", () => {
			window.open(blob.url, "_blank");
		});

		const actions = el.createDiv("blob-file-actions");

		// Copy URL
		const copyBtn = actions.createEl("button", { attr: { "aria-label": "Copy URL" } });
		setIcon(copyBtn, "copy");
		copyBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			navigator.clipboard.writeText(blob.url);
			new Notice("URL copied");
		});

		// Copy markdown
		const mdBtn = actions.createEl("button", { attr: { "aria-label": "Copy as Markdown" } });
		setIcon(mdBtn, "image");
		mdBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			navigator.clipboard.writeText(`![${filename}](${blob.url})`);
			new Notice("Markdown copied");
		});

		// Delete
		const delBtn = actions.createEl("button", { attr: { "aria-label": "Delete" } });
		setIcon(delBtn, "trash-2");
		delBtn.addEventListener("click", async (e) => {
			e.stopPropagation();
			try {
				await deleteBlob(blob.url, this.plugin.settings);
				new Notice(`Deleted ${filename}`);
				await this.refresh();
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				new Notice(`Delete failed: ${msg}`);
			}
		});
	}

	private getFileIcon(pathname: string): string {
		const ext = pathname.split(".").pop()?.toLowerCase() ?? "";
		switch (ext) {
			case "png":
			case "jpg":
			case "jpeg":
			case "gif":
			case "webp":
			case "avif":
			case "svg":
			case "bmp":
			case "ico":
				return "image";
			case "mp4":
			case "webm":
			case "mov":
				return "film";
			case "pdf":
				return "file-text";
			default:
				return "file";
		}
	}
}
