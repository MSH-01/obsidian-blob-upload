import { App, PluginSettingTab, Setting } from "obsidian";
import type BlobUploadPlugin from "./main";

export interface BlobUploadSettings {
	token: string;
	basePathPrefix: string;
	autoUploadOnPaste: boolean;
	autoUploadOnDrop: boolean;
	slugifyFilenames: boolean;
	allowOverwrite: boolean;
	maxFileSizeMB: number;
}

export const DEFAULT_SETTINGS: BlobUploadSettings = {
	token: "",
	basePathPrefix: "assets",
	autoUploadOnPaste: true,
	autoUploadOnDrop: true,
	slugifyFilenames: true,
	allowOverwrite: true,
	maxFileSizeMB: 50,
};

export class BlobUploadSettingTab extends PluginSettingTab {
	plugin: BlobUploadPlugin;

	constructor(app: App, plugin: BlobUploadPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Blob read/write token")
			.setDesc("Your Vercel Blob BLOB_READ_WRITE_TOKEN")
			.addText((text) =>
				text
					.setPlaceholder("vercel_blob_rw_...")
					.setValue(this.plugin.settings.token)
					.then((t) => (t.inputEl.type = "password"))
					.onChange(async (value) => {
						this.plugin.settings.token = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Base path prefix")
			.setDesc(
				'Prefix for blob pathnames (e.g. "assets" → assets/folder/file.png)',
			)
			.addText((text) =>
				text
					.setPlaceholder("assets")
					.setValue(this.plugin.settings.basePathPrefix)
					.onChange(async (value) => {
						this.plugin.settings.basePathPrefix = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Auto-upload on paste")
			.setDesc("Automatically upload images when pasted into the editor")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoUploadOnPaste)
					.onChange(async (value) => {
						this.plugin.settings.autoUploadOnPaste = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Auto-upload on drop")
			.setDesc("Automatically upload images when dropped into the editor")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoUploadOnDrop)
					.onChange(async (value) => {
						this.plugin.settings.autoUploadOnDrop = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Slugify filenames")
			.setDesc(
				"Convert filenames to URL-safe slugs (lowercase, no spaces/diacritics)",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.slugifyFilenames)
					.onChange(async (value) => {
						this.plugin.settings.slugifyFilenames = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Allow overwrite")
			.setDesc("Allow overwriting existing blobs with the same pathname")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.allowOverwrite)
					.onChange(async (value) => {
						this.plugin.settings.allowOverwrite = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Max file size (MB)")
			.setDesc("Maximum file size allowed for upload")
			.addText((text) =>
				text
					.setPlaceholder("50")
					.setValue(String(this.plugin.settings.maxFileSizeMB))
					.onChange(async (value) => {
						const num = Number(value);
						if (!isNaN(num) && num > 0) {
							this.plugin.settings.maxFileSizeMB = num;
							await this.plugin.saveSettings();
						}
					}),
			);
	}
}
