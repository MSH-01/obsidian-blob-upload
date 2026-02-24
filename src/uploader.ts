import { requestUrl } from "obsidian";
import type { BlobUploadSettings } from "./settings";
import { getMimeType } from "./utils";

const BLOB_API_BASE = "https://blob.vercel-storage.com";

export interface BlobUploadResult {
	url: string;
	pathname: string;
	contentType: string;
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
