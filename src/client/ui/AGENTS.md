# Client UI

- `GeneratedMarkdown` is the only shared renderer for model-authored Markdown. It intentionally skips raw HTML and only preserves fragment and HTTP(S) links; do not replace it with direct HTML injection.
- `BrandBanner` is the persistent page-level brand boundary. Use it once in each top-level journey shell; `BrandLockup` remains the compact drawer-only form.
