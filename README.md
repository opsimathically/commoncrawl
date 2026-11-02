# Common Crawl URL downloader prototype

This unfinished TypeScript/Node.js library lists Common Crawl collections and streams URLs from gzip CDXJ indexes through an asynchronous callback. The package name remains the existing placeholder `@opsimathically/set_project_name`; no published release is asserted.

Run `npm ci`, then `npm run build` to build locally. `npm test` skips the real database/crawl integration by default. The integration creates or writes a MongoDB `urls_db` database and may crawl without a URL limit; run it only when those operations are intended, with `COMMONCRAWL_ENABLE_LIVE_TESTS=true` and `COMMONCRAWL_TEST_ENV_FILE` pointing to your separately stored configuration. No configuration values are included here.

`CommonCrawlURLDownloader.collectionList()` fetches collection metadata. `get()` accepts `crawl`, `max_index_files`, `max_urls`, `user_agent`, `extra` and `onUrl`; return `breakloop` from the callback to stop. Existing defaults remain crawl `CC-MAIN-2025-38`, ten index files and no URL limit. This prototype is not a complete compatibility or resource-cleanup guarantee.

See [source exports](src/index.ts) and the [opt-in integration](test/url_downloader/url_downloader.test.ts).
