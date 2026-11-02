import https from 'node:https';

import { v1 as uuidv1 } from 'uuid';
import delay from 'delay';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import { parseOptions } from './options.js';
import { getRandomPokemon } from './pokemondb.js';
import { MAX_BATCH_SIZE, FatalWriteError, writeBatch, newStats, mergeStats } from './writer.js';

// Attempts per request handled by the SDK (standard mode: exponential backoff with jitter).
const MAX_SDK_ATTEMPTS = 5;

let docClient;

function getRandomLatLon() {
  return {
    lat: 42.0 + Math.random()*2,
    lon: 2.1 + Math.random()*2
  }
}

function buildPutRequests(numberOfItems) {
  const putRequests = [];
  for (let i=0; i < numberOfItems; i++) {
    putRequests.push({
      PutRequest: {
        Item: {
          uuid : uuidv1(),
          timestamp : Date.now() + Math.random(),
          pokemon : getRandomPokemon(),
          latLon  : getRandomLatLon()
        }
      }
    });
  }
  return putRequests;
}

async function writeItemBurst(tableName, numberOfItems, stats) {
  const promises = [];
  for (let i=0; i < numberOfItems; i += MAX_BATCH_SIZE) {
    const batchSize = Math.min(MAX_BATCH_SIZE, numberOfItems - i);
    promises.push(writeBatch(docClient, tableName, buildPutRequests(batchSize), stats));
  }
  // writeBatch only rejects on fatal errors, which must stop the run.
  return Promise.all(promises);
}

function formatErrors(errors) {
  return Object.entries(errors).map(([name, count]) => `${name}=${count}`).join(', ');
}

async function loop(tableName, numberOfSeconds, pressure) {
  const total = newStats();
  const tStart = Date.now();

  for (let i=0; i < numberOfSeconds; i++) {
    const stats = newStats();
    const t0 = Date.now();
    await writeItemBurst(tableName, pressure, stats);
    const elapsed = Date.now() - t0;
    // Effective rate over the iteration slot (at least one second).
    const rate = Math.round(stats.written * 1000 / Math.max(elapsed, 1000));

    let line = `#${i+1}: ${stats.written}/${pressure} written, ${stats.failed} failed in ${elapsed}ms ` +
               `(${rate} items/s) | SDK retries: ${stats.sdkRetries}, unprocessed resent: ${stats.unprocessedResent}`;
    if (stats.failed > 0) line += ` | errors: ${formatErrors(stats.errors)}`;
    console.info(line);

    mergeStats(total, stats);
    if (elapsed < 1000) {
      await delay(1000 - elapsed);
    } else {
      console.warn(`  Iteration took ${elapsed}ms (> 1s): target rate of ${pressure} items/s not reached.`);
    }
  }

  const totalSeconds = (Date.now() - tStart) / 1000;
  console.info(`Summary: ${total.written}/${pressure * numberOfSeconds} written, ${total.failed} failed ` +
               `in ${totalSeconds.toFixed(1)}s (${Math.round(total.written / totalSeconds)} items/s). ` +
               `SDK retries: ${total.sdkRetries}, unprocessed resent: ${total.unprocessedResent}.`);
  if (total.failed > 0) {
    console.warn(`Failed items by cause: ${formatErrors(total.errors)}.`);
  }
  return total;
}

const options = parseOptions();
const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 150,
  rejectUnauthorized: true
});

const client = new DynamoDBClient({
  region : options.region,
  requestHandler : new NodeHttpHandler({ httpsAgent: agent }),
  retryMode : 'standard',
  maxAttempts : MAX_SDK_ATTEMPTS
});
docClient = DynamoDBDocumentClient.from(client);

console.info(`Starting application. Writing ${options.pressure} items each second for ${options.seconds} `+
             `seconds in ${options.region}/${options.table}.`);
try {
  const total = await loop(options.table, options.seconds, options.pressure);
  console.info('All done.');
  if (total.failed > 0) process.exitCode = 1;
} catch (error) {
  if (!(error instanceof FatalWriteError)) throw error;
  console.error(`Aborting: ${error.message}`);
  process.exitCode = 2;
} finally {
  client.destroy();
}
