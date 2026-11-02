import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import * as readline from 'node:readline';

export type cc_collection_info_t = {
  id: string;
  name: string;
  timegate: string;
  'cdx-api': string;
  from: string;
  to: string;
};

/**
 * @description
 * This class is used for gathering URLs from commoncrawl.  URLs are useful for developing things like
 * parsers, or analyzers, etc.  CommonCrawl provides a very useful resource for gathering these URLs.  This
 * class utilizes streams where applicable to ensure memory footprints don't get crazy.
 */
export class CommonCrawlURLDownloader {
  constructor() {}

  // Download and parse a list of collections
  public async collectionList(): Promise<cc_collection_info_t[] | null> {
    let list: cc_collection_info_t[] = [];
    const res = await fetch(`https://index.commoncrawl.org/collinfo.json`);
    list = (await res.json()) as cc_collection_info_t[];
    if (Array.isArray(list) !== true) return null;
    if (list.length <= 0) return null;
    return list;
  }

  // Get urls from a collection.
  public async get<extra_t>(params: {
    crawl?: string;
    max_index_files?: number;
    max_urls?: number;
    user_agent?: string;
    extra?: extra_t;
    onUrl: (
      url: string,
      extra?: extra_t
    ) => Promise<boolean | 'breakloop' | void>;
  }) {
    const ccud_ref = this;

    // destructure locals
    let { crawl, max_index_files, max_urls, user_agent } = params;

    // set defaults
    if (!crawl) crawl = 'CC-MAIN-2025-38';
    if (!max_index_files) max_index_files = 10;
    if (!max_urls) max_urls = -1;
    if (!user_agent)
      user_agent = 'commoncrawl-cdx-to-urls/1.0 (+https://commoncrawl.org/)';

    // define paths url
    const paths_url = `https://data.commoncrawl.org/crawl-data/${crawl}/cc-index.paths.gz`;

    let urls_written = 0;
    let index_files_processed = 0;

    // 1) Read cc-index.paths.gz (each line is a relative path to a .gz CDX index file)
    let do_exit = false;
    await ccud_ref.readGzLines(
      paths_url,
      user_agent,
      async (relative_path_line) => {
        if (do_exit) return 'breakloop';

        // check for max urls (negative 1 is just unlimited urls)
        if (max_urls !== -1) {
          if (urls_written >= max_urls) return 'breakloop';
        }

        if (index_files_processed >= max_index_files) return 'breakloop';

        const rel = relative_path_line.trim();
        if (!rel) return;

        index_files_processed += 1;

        const index_file_url = rel.startsWith('http')
          ? rel
          : `https://data.commoncrawl.org/${rel}`;

        // 2) Stream each CDX index .gz file; extract "url" from each CDXJ line
        await ccud_ref.readGzLines(
          index_file_url,
          user_agent,
          async (cdx_line) => {
            if (do_exit) return 'breakloop';
            if (max_urls !== -1) {
              if (urls_written >= max_urls) return 'breakloop';
            }
            const url = ccud_ref.extractUrlFromCdxjLine(cdx_line);
            if (!url) return;
            urls_written += 1;

            // run callback with url as parameter
            const result = await params.onUrl(url, params.extra);
            if (result === 'breakloop') {
              do_exit = true;
              return 'breakloop';
            }
          }
        );
      }
    );
  }

  // %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
  // %%% Private Methods %%%%%%%%%%%%
  // %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

  async fetchStream(
    url: string,
    user_agent: string
  ): Promise<NodeJS.ReadableStream> {
    const res = await fetch(url, { headers: { 'User-Agent': user_agent } });
    if (!res.ok || !res.body) {
      throw new Error(
        `Fetch failed: ${res.status} ${res.statusText} for ${url}`
      );
    }
    return Readable.fromWeb(res.body as any);
  }

  async readGzLines(
    url: string,
    user_agent: string,
    onLine: (line: string) => Promise<void | 'breakloop'> | void
  ) {
    const src = await this.fetchStream(url, user_agent);
    const gunzip = createGunzip();
    const rl = readline.createInterface({
      input: src.pipe(gunzip),
      crlfDelay: Infinity
    });
    for await (const line of rl) {
      const result = await onLine(line);
      if (result === 'breakloop') {
        break;
      }
    }

    rl.close();
  }

  /**
   * CDXJ line format (commonly):
   *   <key> <timestamp> <json>
   * where <json> contains fields such as "url", "status", "mime", etc.
   */
  extractUrlFromCdxjLine(line: string): string | null {
    // Fast path: find the first '{' (start of JSON object)
    const json_start = line.indexOf('{');
    if (json_start === -1) return null;

    const jsonStr = line.slice(json_start);
    try {
      const obj = JSON.parse(jsonStr) as { url?: unknown };
      return typeof obj.url === 'string' ? obj.url : null;
    } catch {
      return null;
    }
  }
}
