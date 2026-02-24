import {
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	TFile,
} from "obsidian";
import {
	BlobUploadSettings,
	BlobUploadSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";
import { uploadToBlob } from "./uploader";
import {
	allFilesAreImages,
	buildBlobPathname,
	isImageFile,
	slugify,
} from "./utils";

export default class BlobUploadPlugin extends Plugin {
	settings: BlobUploadSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BlobUploadSettingTab(this.app, this));

		// Paste interception
		this.registerEvent(
			this.app.workspace.on("editor-paste", (evt: ClipboardEvent, editor: Editor) => {
				if (!this.settings.autoUploadOnPaste || !this.settings.token) return;
				const files = evt.clipboardData?.files;
				if (!files || files.length === 0) return;
				if (!allFilesAreImages(files)) return;

				evt.preventDefault();
				const activeFile = this.app.workspace.getActiveFile();
				const activePath = activeFile?.path ?? "";
				for (let i = 0; i < files.length; i++) {
					this.uploadFileAndInsert(files[i], editor, activePath);
				}
			}),
		);

		// Drop interception
		this.registerEvent(
			this.app.workspace.on("editor-drop", (evt: DragEvent, editor: Editor) => {
				if (!this.settings.autoUploadOnDrop || !this.settings.token) return;
				const files = evt.dataTransfer?.files;
				if (!files || files.length === 0) return;
				if (!allFilesAreImages(files)) return;

				evt.preventDefault();
				const activeFile = this.app.workspace.getActiveFile();
				const activePath = activeFile?.path ?? "";
				for (let i = 0; i < files.length; i++) {
					this.uploadFileAndInsert(files[i], editor, activePath);
				}
			}),
		);

		// Context menu: upload local image ref
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor) => {
				const line = editor.getLine(editor.getCursor().line);
				const localRef = this.extractLocalImageRef(line);
				if (!localRef) return;

				menu.addItem((item) => {
					item.setTitle("Upload image to Blob Storage")
						.setIcon("upload-cloud")
						.onClick(() => this.uploadLocalRef(localRef, editor));
				});
			}),
		);

		// Command: upload all local images in current note
		this.addCommand({
			id: "upload-all-local-images",
			name: "Upload all local images in current note",
			editorCallback: (editor: Editor) => {
				this.uploadAllLocalImages(editor);
			},
		});

		// Command: upload via file picker
		this.addCommand({
			id: "upload-file-picker",
			name: "Upload file via file picker",
			editorCallback: (editor: Editor) => {
				const input = document.createElement("input");
				input.type = "file";
				input.accept = "image/*";
				input.multiple = true;
				input.onchange = () => {
					if (!input.files) return;
					const activeFile = this.app.workspace.getActiveFile();
					const activePath = activeFile?.path ?? "";
					for (let i = 0; i < input.files.length; i++) {
						this.uploadFileAndInsert(input.files[i], editor, activePath);
					}
				};
				input.click();
			},
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async uploadFileAndInsert(
		file: File,
		editor: Editor,
		activeFilePath: string,
	) {
		const maxBytes = this.settings.maxFileSizeMB * 1024 * 1024;
		if (file.size > maxBytes) {
			new Notice(
				`File "${file.name}" exceeds ${this.settings.maxFileSizeMB} MB limit`,
			);
			return;
		}

		// Generate a placeholder ID
		const placeholderId = String(Math.random()).slice(2, 7);
		const placeholder = `![Uploading ${placeholderId}...]()`;

		// Insert placeholder at cursor
		const cursor = editor.getCursor();
		editor.replaceRange(placeholder, cursor);

		try {
			const filename = this.settings.slugifyFilenames
				? slugify(file.name)
				: file.name;

			const pathname = buildBlobPathname(
				this.settings.basePathPrefix,
				activeFilePath,
				filename,
			);

			const arrayBuffer = await file.arrayBuffer();
			const result = await uploadToBlob(
				arrayBuffer,
				pathname,
				filename,
				this.settings,
			);

			// Replace placeholder with final markdown
			const markdown = `![${filename}](${result.url})`;
			this.replacePlaceholder(editor, placeholder, markdown);
			new Notice(`Uploaded ${filename}`);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.replacePlaceholder(
				editor,
				placeholder,
				`<!-- upload failed: ${msg} -->`,
			);
			new Notice(`Upload failed: ${msg}`);
		}
	}

	private replacePlaceholder(
		editor: Editor,
		placeholder: string,
		replacement: string,
	) {
		const content = editor.getValue();
		const idx = content.indexOf(placeholder);
		if (idx === -1) return;

		// Convert string index to editor position
		const before = content.slice(0, idx);
		const lines = before.split("\n");
		const fromLine = lines.length - 1;
		const fromCh = lines[fromLine].length;
		const toLine = fromLine;
		const toCh = fromCh + placeholder.length;

		// Handle if placeholder spans multiple lines (unlikely but safe)
		const placeholderLines = placeholder.split("\n");
		const endLine = fromLine + placeholderLines.length - 1;
		const endCh =
			placeholderLines.length > 1
				? placeholderLines[placeholderLines.length - 1].length
				: toCh;

		editor.replaceRange(
			replacement,
			{ line: fromLine, ch: fromCh },
			{ line: endLine, ch: endCh },
		);
	}

	private extractLocalImageRef(
		line: string,
	): { raw: string; filename: string } | null {
		// Match ![[file.ext]] wiki-link style
		const wikiMatch = line.match(/!\[\[([^\]]+\.(png|jpe?g|gif|webp|svg|avif|bmp|ico))\]\]/i);
		if (wikiMatch) {
			return { raw: wikiMatch[0], filename: wikiMatch[1] };
		}
		// Match ![alt](local-path) where path doesn't start with http
		const mdMatch = line.match(/!\[([^\]]*)\]\((?!https?:\/\/)([^)]+\.(png|jpe?g|gif|webp|svg|avif|bmp|ico))\)/i);
		if (mdMatch) {
			return { raw: mdMatch[0], filename: mdMatch[2] };
		}
		return null;
	}

	private async uploadLocalRef(
		ref: { raw: string; filename: string },
		editor: Editor,
	) {
		if (!this.settings.token) {
			new Notice("Blob token not configured");
			return;
		}

		// Resolve the file in the vault
		const activeFile = this.app.workspace.getActiveFile();
		const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
			ref.filename,
			activeFile?.path ?? "",
		);

		if (!linkedFile || !(linkedFile instanceof TFile)) {
			new Notice(`Could not find "${ref.filename}" in vault`);
			return;
		}

		try {
			const arrayBuffer = await this.app.vault.readBinary(linkedFile);
			const filename = this.settings.slugifyFilenames
				? slugify(linkedFile.name)
				: linkedFile.name;
			const pathname = buildBlobPathname(
				this.settings.basePathPrefix,
				activeFile?.path ?? "",
				filename,
			);

			new Notice(`Uploading ${filename}...`);
			const result = await uploadToBlob(
				arrayBuffer,
				pathname,
				filename,
				this.settings,
			);

			// Replace the local ref with the blob URL
			const markdown = `![${filename}](${result.url})`;
			const content = editor.getValue();
			const newContent = content.replace(ref.raw, markdown);
			editor.setValue(newContent);
			new Notice(`Uploaded ${filename}`);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`Upload failed: ${msg}`);
		}
	}

	private async uploadAllLocalImages(editor: Editor) {
		if (!this.settings.token) {
			new Notice("Blob token not configured");
			return;
		}

		const content = editor.getValue();
		const activeFile = this.app.workspace.getActiveFile();
		const activePath = activeFile?.path ?? "";

		// Collect all local image refs
		const refs: { raw: string; filename: string; line: number }[] = [];
		const lines = content.split("\n");

		for (let i = 0; i < lines.length; i++) {
			const ref = this.extractLocalImageRef(lines[i]);
			if (ref) refs.push({ ...ref, line: i });
		}

		if (refs.length === 0) {
			new Notice("No local image references found");
			return;
		}

		new Notice(`Uploading ${refs.length} image(s)...`);
		let uploaded = 0;
		let currentContent = editor.getValue();

		for (const ref of refs) {
			const linkedFile = this.app.metadataCache.getFirstLinkpathDest(
				ref.filename,
				activePath,
			);

			if (!linkedFile || !(linkedFile instanceof TFile)) {
				new Notice(`Skipping "${ref.filename}" — not found in vault`);
				continue;
			}

			try {
				const arrayBuffer = await this.app.vault.readBinary(linkedFile);
				const filename = this.settings.slugifyFilenames
					? slugify(linkedFile.name)
					: linkedFile.name;
				const pathname = buildBlobPathname(
					this.settings.basePathPrefix,
					activePath,
					filename,
				);

				const result = await uploadToBlob(
					arrayBuffer,
					pathname,
					filename,
					this.settings,
				);

				const markdown = `![${filename}](${result.url})`;
				currentContent = currentContent.replace(ref.raw, markdown);
				uploaded++;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				new Notice(`Failed to upload "${ref.filename}": ${msg}`);
			}
		}

		editor.setValue(currentContent);
		new Notice(`Uploaded ${uploaded}/${refs.length} image(s)`);
	}
}
