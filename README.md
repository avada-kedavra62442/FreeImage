# FreeImage

Free, browser-based image editing and privacy toolkit. Images are processed locally in your browser wherever the selected operation allows it.

## Development

`npm install` then `npm run dev`.

## Privacy

Image files are handled client-side. The app does not upload image content to a processing server. The solid-background remover is a simple edge-connected color tool, not an AI segmentation model. Automatic detection of sensitive text is not included in this initial build.
