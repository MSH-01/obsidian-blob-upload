const MIME_MAP: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
	avif: "image/avif",
	bmp: "image/bmp",
	ico: "image/x-icon",
	mp4: "video/mp4",
	webm: "video/webm",
	mov: "video/quicktime",
	pdf: "application/pdf",
};

const IMAGE_MIMES = new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp",
	"image/svg+xml",
	"image/avif",
	"image/bmp",
	"image/x-icon",
]);

export function slugify(filename: string): string {
	const dot = filename.lastIndexOf(".");
	const name = dot > 0 ? filename.slice(0, dot) : filename;
	const ext = dot > 0 ? filename.slice(dot) : "";

	const slug = name
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "") // strip diacritics
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return slug + ext.toLowerCase();
}

export function getMimeType(filename: string): string {
	const ext = filename.split(".").pop()?.toLowerCase() ?? "";
	return MIME_MAP[ext] ?? "application/octet-stream";
}

export function buildBlobPathname(
	basePrefix: string,
	activeFilePath: string,
	filename: string,
): string {
	// activeFilePath is the vault-relative path of the note, e.g. "reviews/music/some-note.md"
	const folder = activeFilePath.includes("/")
		? activeFilePath.slice(0, activeFilePath.lastIndexOf("/"))
		: "";

	const parts = [basePrefix, folder, filename].filter(Boolean);
	return parts.join("/");
}

export function allFilesAreImages(files: FileList | File[]): boolean {
	if (!files || files.length === 0) return false;
	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		const mime = file.type || getMimeType(file.name);
		if (!IMAGE_MIMES.has(mime)) return false;
	}
	return true;
}

export function isImageFile(filename: string): boolean {
	return IMAGE_MIMES.has(getMimeType(filename));
}
