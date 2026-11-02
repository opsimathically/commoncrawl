import test from 'node:test';
import assert from 'node:assert';
import { CommonCrawlURLDownloader } from '@src/index';
import { MongoDB, MongoDBBufferedStackedInsert } from '@opsimathically/multidb';
import { createHash } from 'crypto';

export function sha1(input: string): string {
  return createHash('sha1').update(input, 'utf8').digest('hex');
}

// %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
// %%% Test Definitions %%%%%%%%%%%%%%%%%%%%%%%
// %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

import dotenv from 'dotenv';

// set this to the path of your testing dotenv file.
const enable_live_test = process.env.COMMONCRAWL_ENABLE_LIVE_TESTS === 'true';
if (enable_live_test) {
  const env_path = process.env.COMMONCRAWL_TEST_ENV_FILE?.trim();
  if (!env_path) throw new Error('Set COMMONCRAWL_TEST_ENV_FILE to your external integration configuration.');
  dotenv.config({ path: env_path });
}

(enable_live_test ? test : test.skip)('Download seed urls.', async function () {
  // %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
  // %%% Setup Storage Environment %%%%%%%%%%%%%%%%%%%%%%
  // %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

  const mongodb_client = new MongoDB();
  const connected_ok = await mongodb_client.connect({
    host: process.env.MONGODB_HOST!,
    username: process.env.MONGODB_USERNAME!,
    authdb: process.env.MONGODB_AUTHDB!,
    replicaSet: process.env.MONGODB_REPLICASET!,
    password: process.env.MONGODB_PASSWORD!,
    port: parseInt(process.env.MONGODB_PORT!)
  });
  assert.ok(connected_ok, 'Failed to connect to mongodb');

  const urls_db_name = 'urls_db';

  // if our test database already exists, delete it first
  if (!(await mongodb_client.databaseExists(urls_db_name))) {
    await mongodb_client.createDatabase({
      info: {
        description: 'Collection of urls, parsed or otherwise.'
      },
      name: urls_db_name
    });
  }

  assert.ok(
    await mongodb_client.databaseExists(urls_db_name),
    'URLs database does not exist when it should.'
  );

  // attempt to create index
  await mongodb_client.createIndexOnCollection({
    db: urls_db_name,
    collection: 'unparsed_urls',
    unique: true,
    spec: {
      url_sha1_hash: 1
    }
  });

  const mongo_stacked_insert = new MongoDBBufferedStackedInsert({
    db: urls_db_name,
    collection: 'unparsed_urls',
    interval_ms: 10000,
    max_length: 500,
    mongodb_client: mongodb_client,
    onError: async function (err) {
      if (err) return;
    },
    write_options: {
      ordered: false
    }
  });

  const ccud = new CommonCrawlURLDownloader();
  const list = await ccud.collectionList();
  assert.ok(list, 'Could not download collection list.');

  const finished_sets: string[] = [
    'CC-MAIN-2008-2009',
    'CC-MAIN-2009-2010',
    'CC-MAIN-2012',
    'CC-MAIN-2013-20',
    'CC-MAIN-2013-48'
  ];

  // iterate in reverse order
  let insert_count = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i];
    if (finished_sets.includes(item.id)) {
      console.log(`Skipping ${item.id} as we've already completed this set.`);
      continue;
    }
    console.log(`# Starting ${item.id}`);

    await ccud.get({
      crawl: item.id,
      max_urls: -1,
      onUrl: async function (url) {
        insert_count++;
        if (insert_count >= 100000) {
          console.log('> +100,000 records.');
          insert_count = 0;
        }
        await mongo_stacked_insert.bufferedInsert({
          records: [
            {
              url: url,
              url_sha1_hash: sha1(url),
              source: 'commoncrawl.org/' + item.id
            }
          ]
        });
      }
    });
    // flush any remaining records
    mongo_stacked_insert.flush();
    console.log(`# Finished ${item.id}\n`);
  }

  // record set should be empty array now
  assert(true);
});
