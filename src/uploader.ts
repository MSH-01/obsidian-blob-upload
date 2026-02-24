import { requestUrl } from "obsidian";
import type { BlobUploadSettings } from "./settings";
import { getMimeType } from "./utils";

const BLOB_API_BASE = "https://blob.vercel-storage.com";

export interface BlobUploadResult {
	url: string;
	pathname: string;
	contentType: string;
}

export interface BlobEntry {
	url: string;
	pathname: string;
	size: number;
	uploadedAt: string;
}

export interface BlobListResult {
	blobs: BlobEntry[];
	cursor?: string;
	hasMore: boolean;
}

export async function listBlobs(
	settings: BlobUploadSettings,
	prefix?: string,
): Promise<BlobEntry[]> {
	const all: BlobEntry[] = [];
	let cursor: string | undefined;

	do {
		const params = new URLSearchParams({ limit: "1000" });
		if (prefix) params.set("prefix", prefix);
		if (cursor) params.set("cursor", cursor);

		const response = await requestUrl({
			url: `${BLOB_API_BASE}?${params}`,
			method: "GET",
			headers: { authorization: `Bearer ${settings.token}` },
			throw: true,
		});

		const data: BlobListResult = response.json;
		all.push(...data.blobs);
		cursor = data.cursor;
		if (!data.hasMore) break;
	} while (cursor);

	return all;
}

export async function deleteBlob(
	url: string,
	settings: BlobUploadSettings,
): Promise<void> {
	await requestUrl({
		url: `${BLOB_API_BASE}/delete`,
		method: "POST",
		headers: {
			authorization: `Bearer ${settings.token}`,
			"content-type": "application/json",
		},
		body: JSON.stringify({ urls: [url] }),
		throw: true,
	});
}

export async function uploadToBlob(
	arrayBuffer: ArrayBuffer,
	pathname: string,
	filename: string,
	settings: BlobUploadSettings,
): Promise<BlobUploadResult> {
	const contentType = getMimeType(filename);

	const params = new URLSearchParams({
		access: "public",
		addRandomSuffix: "false",
		allowOverwrite: String(settings.allowOverwrite),
	});

	const response = await requestUrl({
		url: `${BLOB_API_BASE}/${pathname}?${params}`,
		method: "PUT",
		headers: {
			authorization: `Bearer ${settings.token}`,
			"x-content-type": contentType,
		},
		body: arrayBuffer,
		throw: true,
	});

	const data = response.json;
	return {
		url: data.url,
		pathname: data.pathname,
		contentType: data.contentType,
	};
}
