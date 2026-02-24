# Obsidian Blob Upload

This is a simple Obsidian plugin to upload assets to Vercel blob storage on paste / file drop in Obsidian and then embed the image with a link to the live upload.

Currently it only supports Vercel Blob Storage uploads, but support for S3 is coming next.

### Settings

`Blob read/writen token` : VERCEL_READ_WRITE_TOKEN
`Base path prefix` : Prefix for blob pathnames
`Auto-upload on paste` : BOOLEAN
`Auto-upload on drop` : BOOLEAN
`Slugify filenames` : BOOLEAN
`Allow overwrite` : BOOLEAN
`Max file size (MB)` : INTEGER
