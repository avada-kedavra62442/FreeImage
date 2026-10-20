# FreeImage

FreeImage is a browser-first image editing workspace with a premium dark glass interface, layer-based edits, image adjustments, and PNG/JPEG/WebP export.

## AI image editing

The AI Studio calls the Vercel serverless route `/api/ai`, which uses OpenAI's image editing API. Configure `OPENAI_API_KEY` in the Vercel project's Environment Variables and redeploy before using AI edits. AI API usage may incur charges. Without a key, the interface shows a configuration message rather than pretending AI worked.

Standard canvas edits run in the browser. When AI editing is explicitly requested, a resized copy of the image and the prompt are sent to the configured AI provider. The original local file is not overwritten.
