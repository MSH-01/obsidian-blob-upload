import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type BlobUploadPlugin from "./main";
import { BlobEntry, listBlobs, deleteBlob, uploadToBlob } from "./uploader";
import { slugify, buildBlobPathname, isImageFile } from "./utils";

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
	private toggleBtn: HTMLButtonElement | null = null;
	private treeRoot: TreeFolder | null = null;
	private basePath: string[] = [];
	private currentPath: string[] = [];
	private viewMode: "grid" | "list";

	constructor(leaf: WorkspaceLeaf, plugin: BlobUploadPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.viewMode = plugin.settings.explorerViewMode;
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

		this.toggleBtn = actions.createEl("button", {
			attr: { "aria-label": "Toggle view" },
		});
		this.updateToggleIcon();
		this.toggleBtn.addEventListener("click", () => this.toggleViewMode());

		this.refreshBtn = actions.createEl("button", {
			attr: { "aria-label": "Refresh" },
		});
		setIcon(this.refreshBtn, "refresh-cw");
		this.refreshBtn.addEventListener("click", () => this.refresh());

		// Breadcrumb (grid mode only)
		container.createDiv("blob-explorer-breadcrumb");

		// Content area (shared by both modes)
		const content = container.createDiv("blob-explorer-content");
		this.setupDropZone(content);

		// Stats footer
		container.createDiv("blob-explorer-stats");
	}

	private toggleViewMode() {
		this.viewMode = this.viewMode === "grid" ? "list" : "grid";
		this.plugin.settings.explorerViewMode = this.viewMode;
		this.plugin.saveSettings();
		this.updateToggleIcon();
		this.renderContent();
	}

	private updateToggleIcon() {
		if (!this.toggleBtn) return;
		setIcon(
			this.toggleBtn,
			this.viewMode === "grid" ? "list" : "layout-grid",
		);
		this.toggleBtn.setAttribute(
			"aria-label",
			this.viewMode === "grid"
				? "Switch to list view"
				: "Switch to grid view",
		);
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
			this.treeRoot = buildTree(this.blobs);
			this.basePath = this.computeBasePath(this.treeRoot);

			if (!this.isPathValid(this.currentPath)) {
				this.currentPath = [...this.basePath];
			}

			this.renderContent();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.showEmpty(`Failed to load: ${msg}`);
		}
	}

	private renderContent() {
		if (this.viewMode === "grid") {
			this.renderGrid();
		} else {
			this.renderList();
		}
	}

	// ── Shared helpers ───────────────────────────────────────────

	private computeBasePath(root: TreeFolder): string[] {
		const path: string[] = [];
		let node = root;
		while (node.children.length === 1 && node.files.length === 0) {
			node = node.children[0];
			path.push(node.name);
		}
		return path;
	}

	private isPathValid(path: string[]): boolean {
		if (!this.treeRoot) return false;
		let node = this.treeRoot;
		for (const segment of path) {
			const child = node.children.find((c) => c.name === segment);
			if (!child) return false;
			node = child;
		}
		return true;
	}

	private getCurrentFolder(): TreeFolder | null {
		if (!this.treeRoot) return null;
		let node = this.treeRoot;
		for (const segment of this.currentPath) {
			const child = node.children.find((c) => c.name === segment);
			if (!child) return node;
			node = child;
		}
		return node;
	}

	private navigateTo(path: string[]) {
		this.currentPath = [...path];
		this.renderContent();
	}

	private showLoading() {
		this.refreshBtn?.addClass("is-loading");
		const el = this.contentEl.querySelector(".blob-explorer-content");
		if (el) {
			el.empty();
			(el as HTMLElement).createDiv({
				cls: "blob-explorer-loading",
				text: "Loading...",
			});
		}
	}

	private showEmpty(message: string) {
		this.refreshBtn?.removeClass("is-loading");
		const el = this.contentEl.querySelector(".blob-explorer-content");
		if (el) {
			el.empty();
			(el as HTMLElement).createDiv({
				cls: "blob-explorer-empty",
				text: message,
			});
		}
		const stats = this.contentEl.querySelector(".blob-explorer-stats");
		if (stats) (stats as HTMLElement).setText("");
	}

	private renderStats() {
		const stats = this.contentEl.querySelector(
			".blob-explorer-stats",
		) as HTMLElement;
		if (stats) {
			stats.setText(
				`${this.blobs.length} files — ${formatSize(totalSize(this.blobs))}`,
			);
		}
	}

	private renderFileActions(
		parent: HTMLElement,
		blob: BlobEntry,
		filename: string,
	) {
		const copyBtn = parent.createEl("button", {
			attr: { "aria-label": "Copy URL" },
		});
		setIcon(copyBtn, "copy");
		copyBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			navigator.clipboard.writeText(blob.url);
			new Notice("URL copied");
		});

		const mdBtn = parent.createEl("button", {
			attr: { "aria-label": "Copy as Markdown" },
		});
		setIcon(mdBtn, "image");
		mdBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			navigator.clipboard.writeText(`![${filename}](${blob.url})`);
			new Notice("Markdown copied");
		});

		const delBtn = parent.createEl("button", {
			attr: { "aria-label": "Delete" },
		});
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

	// ── Grid (Finder) view ───────────────────────────────────────

	private renderGrid() {
		this.refreshBtn?.removeClass("is-loading");

		// Show breadcrumb
		const breadcrumbEl = this.contentEl.querySelector(
			".blob-explorer-breadcrumb",
		) as HTMLElement;
		breadcrumbEl?.removeClass("is-hidden");

		const contentEl = this.contentEl.querySelector(
			".blob-explorer-content",
		) as HTMLElement;
		if (!contentEl) return;
		contentEl.empty();

		if (this.blobs.length === 0) {
			contentEl.createDiv({
				cls: "blob-explorer-empty",
				text: "No blobs found",
			});
			return;
		}

		this.renderBreadcrumb();

		const folder = this.getCurrentFolder();
		if (!folder) return;

		if (folder.children.length === 0 && folder.files.length === 0) {
			contentEl.createDiv({
				cls: "blob-explorer-empty",
				text: "Empty folder",
			});
			return;
		}

		const items = contentEl.createDiv("blob-grid");

		for (const child of folder.children) {
			this.renderGridFolder(items, child);
		}
		for (const file of folder.files) {
			this.renderGridFile(items, file);
		}

		this.renderStats();
	}

	private renderBreadcrumb() {
		const el = this.contentEl.querySelector(
			".blob-explorer-breadcrumb",
		) as HTMLElement;
		if (!el) return;
		el.empty();

		const home = el.createSpan({
			cls: "blob-breadcrumb-item blob-breadcrumb-home",
		});
		setIcon(home, "home");
		home.addEventListener("click", () =>
			this.navigateTo([...this.basePath]),
		);

		const displaySegments = this.currentPath.slice(this.basePath.length);

		for (let i = 0; i < displaySegments.length; i++) {
			const sep = el.createSpan({ cls: "blob-breadcrumb-sep" });
			setIcon(sep, "chevron-right");

			const isLast = i === displaySegments.length - 1;
			const seg = el.createSpan({
				cls: `blob-breadcrumb-item${isLast ? " is-active" : ""}`,
				text: displaySegments[i],
			});

			if (!isLast) {
				const targetPath = [
					...this.basePath,
					...displaySegments.slice(0, i + 1),
				];
				seg.addEventListener("click", () =>
					this.navigateTo(targetPath),
				);
			}
		}
	}

	private renderGridFolder(parent: HTMLElement, folder: TreeFolder) {
		const el = parent.createDiv("blob-grid-item blob-grid-folder");

		const preview = el.createDiv("blob-grid-preview");
		const iconEl = preview.createDiv("blob-grid-icon");
		setIcon(iconEl, "folder");

		const name = el.createDiv("blob-grid-name");
		name.setText(folder.name);
		name.setAttribute("title", folder.name);

		const meta = el.createDiv("blob-grid-meta");
		const count = countFiles(folder);
		meta.setText(`${count} ${count === 1 ? "item" : "items"}`);

		el.addEventListener("click", () => {
			this.navigateTo([...this.currentPath, folder.name]);
		});

		const folderPath = [...this.currentPath, folder.name].join("/");
		this.setupFolderDrop(el, folderPath);
	}

	private renderGridFile(parent: HTMLElement, blob: BlobEntry) {
		const el = parent.createDiv("blob-grid-item blob-grid-file");
		const filename = blob.pathname.split("/").pop() ?? blob.pathname;
		const isImg = isImageFile(filename);

		const preview = el.createDiv("blob-grid-preview");

		if (isImg) {
			const img = preview.createEl("img", {
				cls: "blob-grid-thumb",
				attr: { src: blob.url, alt: filename, loading: "lazy" },
			});
			img.addEventListener("error", () => {
				img.remove();
				const fallback = preview.createDiv("blob-grid-icon");
				setIcon(fallback, "image");
			});
		} else {
			const iconEl = preview.createDiv("blob-grid-icon");
			setIcon(iconEl, this.getFileIcon(blob.pathname));
		}

		const name = el.createDiv("blob-grid-name");
		name.setText(filename);
		name.setAttribute("title", filename);

		const meta = el.createDiv("blob-grid-meta");
		meta.setText(formatSize(blob.size));

		const actions = el.createDiv("blob-grid-actions");
		this.renderFileActions(actions, blob, filename);

		el.addEventListener("click", () => {
			window.open(blob.url, "_blank");
		});
	}

	// ── List (tree) view ─────────────────────────────────────────

	private renderList() {
		this.refreshBtn?.removeClass("is-loading");

		// Hide breadcrumb
		const breadcrumbEl = this.contentEl.querySelector(
			".blob-explorer-breadcrumb",
		) as HTMLElement;
		breadcrumbEl?.addClass("is-hidden");

		const contentEl = this.contentEl.querySelector(
			".blob-explorer-content",
		) as HTMLElement;
		if (!contentEl) return;
		contentEl.empty();

		if (this.blobs.length === 0) {
			contentEl.createDiv({
				cls: "blob-explorer-empty",
				text: "No blobs found",
			});
			return;
		}

		const root = this.treeRoot!;

		// Smart root: skip single-child wrapper
		if (root.children.length === 1 && root.files.length === 0) {
			const topFolder = root.children[0];
			this.renderListFolder(contentEl, topFolder, 0, true);
		} else {
			for (const folder of root.children) {
				this.renderListFolder(contentEl, folder, 0);
			}
			for (const file of root.files) {
				this.renderListFile(contentEl, file, 0);
			}
		}

		this.renderStats();
	}

	private renderListFolder(
		parent: HTMLElement,
		folder: TreeFolder,
		depth: number,
		startExpanded = false,
		parentPath = "",
	) {
		const folderPath = parentPath
			? `${parentPath}/${folder.name}`
			: folder.name;

		const el = parent.createDiv("blob-list-folder");
		if (!startExpanded) el.addClass("is-collapsed");

		const header = el.createDiv("blob-list-folder-header");
		header.style.setProperty("--indent", String(depth));

		const icon = header.createDiv("blob-list-folder-icon");
		setIcon(icon, "chevron-down");

		header.createSpan({ cls: "blob-list-folder-name", text: folder.name });
		header.createSpan({
			cls: "blob-list-folder-count",
			text: String(countFiles(folder)),
		});

		header.addEventListener("click", () => {
			el.toggleClass("is-collapsed", !el.hasClass("is-collapsed"));
		});

		this.setupFolderDrop(header, folderPath);

		const children = el.createDiv("blob-list-folder-children");

		for (const child of folder.children) {
			this.renderListFolder(
				children,
				child,
				depth + 1,
				false,
				folderPath,
			);
		}
		for (const file of folder.files) {
			this.renderListFile(children, file, depth + 1);
		}
	}

	private renderListFile(
		parent: HTMLElement,
		blob: BlobEntry,
		depth: number,
	) {
		const el = parent.createDiv("blob-list-file");
		el.style.setProperty("--indent", String(depth));

		const icon = el.createDiv("blob-list-file-icon");
		setIcon(icon, this.getFileIcon(blob.pathname));

		const filename = blob.pathname.split("/").pop() ?? blob.pathname;
		el.createSpan({ cls: "blob-list-file-name", text: filename });
		el.createSpan({
			cls: "blob-list-file-size",
			text: formatSize(blob.size),
		});

		el.addEventListener("click", () => {
			window.open(blob.url, "_blank");
		});

		const actions = el.createDiv("blob-list-file-actions");
		this.renderFileActions(actions, blob, filename);
	}

	// ── Drop zones ───────────────────────────────────────────────

	private setupFolderDrop(el: HTMLElement, folderPath: string) {
		el.addEventListener("dragover", (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
		});

		el.addEventListener("dragenter", (e) => {
			e.preventDefault();
			e.stopPropagation();
			el.addClass("is-drop-target");
		});

		el.addEventListener("dragleave", (e) => {
			e.stopPropagation();
			el.removeClass("is-drop-target");
		});

		el.addEventListener("drop", (e) => {
			e.preventDefault();
			e.stopPropagation();
			el.removeClass("is-drop-target");

			const files = e.dataTransfer?.files;
			if (!files || files.length === 0) return;
			this.handleDrop(files, folderPath);
		});
	}

	private setupDropZone(el: HTMLElement) {
		let dragCounter = 0;

		el.addEventListener("dragover", (e) => {
			e.preventDefault();
			if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
		});

		el.addEventListener("dragenter", (e) => {
			e.preventDefault();
			dragCounter++;
			el.addClass("is-drop-target");
		});

		el.addEventListener("dragleave", () => {
			dragCounter--;
			if (dragCounter === 0) el.removeClass("is-drop-target");
		});

		el.addEventListener("drop", (e) => {
			e.preventDefault();
			dragCounter = 0;
			el.removeClass("is-drop-target");

			const files = e.dataTransfer?.files;
			if (!files || files.length === 0) return;
			this.handleDrop(files, this.currentPath.join("/"));
		});
	}

	private async handleDrop(files: FileList, targetPath: string) {
		const { settings } = this.plugin;
		if (!settings.token) {
			new Notice("Blob token not configured");
			return;
		}

		const maxBytes = settings.maxFileSizeMB * 1024 * 1024;
		let uploaded = 0;

		for (let i = 0; i < files.length; i++) {
			const file = files[i];

			if (file.size > maxBytes) {
				new Notice(
					`"${file.name}" exceeds ${settings.maxFileSizeMB} MB limit`,
				);
				continue;
			}

			const filename = settings.slugifyFilenames
				? slugify(file.name)
				: file.name;
			const pathname = targetPath
				? [targetPath, filename].join("/")
				: buildBlobPathname(settings.basePathPrefix, "", filename);

			try {
				new Notice(`Uploading ${filename}...`);
				const buf = await file.arrayBuffer();
				await uploadToBlob(buf, pathname, filename, settings);
				uploaded++;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				new Notice(`Failed to upload "${file.name}": ${msg}`);
			}
		}

		if (uploaded > 0) {
			new Notice(`Uploaded ${uploaded} file(s)`);
			await this.refresh();
		}
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
