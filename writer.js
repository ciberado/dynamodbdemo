import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import delay from 'delay';

// BatchWriteItem accepts at most 25 put/delete requests per call.
export const MAX_BATCH_SIZE = 25;

// Resend attempts for UnprocessedItems (the SDK does not retry those by itself).
const MAX_UNPROCESSED_ATTEMPTS = 8;
const BACKOFF_BASE_MS = 50;
const BACKOFF_CAP_MS = 5000;

// Errors caused by capacity limits: the batch is counted as failed and the run goes on.
// Any other 4xx (missing table, bad credentials, validation...) aborts the run.
const THROTTLING_ERRORS = new Set([
  'ProvisionedThroughputExceededException',
  'ThrottlingException',
  'RequestLimitExceeded',
]);

export class FatalWriteError extends Error {
  constructor(cause) {
    super(`${cause.name}: ${cause.message}`, { cause });
    this.name = 'FatalWriteError';
  }
}

// Exponential backoff with full jitter.
export function backoffDelay(attempt) {
  return Math.random() * Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
}

export function newStats() {
  return { written: 0, failed: 0, sdkRetries: 0, unprocessedResent: 0, errors: {} };
}

export function mergeStats(target, source) {
  target.written += source.written;
  target.failed += source.failed;
  target.sdkRetries += source.sdkRetries;
  target.unprocessedResent += source.unprocessedResent;
  for (const [name, count] of Object.entries(source.errors)) {
    target.errors[name] = (target.errors[name] ?? 0) + count;
  }
  return target;
}

function countError(stats, name, items) {
  stats.failed += items;
  stats.errors[name] = (stats.errors[name] ?? 0) + items;
}

function isFatal(error) {
  if (THROTTLING_ERRORS.has(error.name)) return false;
  const status = error.$metadata?.httpStatusCode;
  return status >= 400 && status < 500;
}

// Retries performed internally by the SDK for this call.
function sdkRetriesOf(output) {
  return Math.max(0, (output?.$metadata?.attempts ?? 1) - 1);
}

/**
 * Writes up to 25 put requests, resending UnprocessedItems with backoff.
 * Updates `stats` in place. Throws FatalWriteError on non-recoverable errors.
 */
export async function writeBatch(docClient, tableName, putRequests, stats) {
  let pending = putRequests;
  for (let attempt = 0; pending.length > 0; attempt++) {
    if (attempt > 0) {
      if (attempt > MAX_UNPROCESSED_ATTEMPTS) {
        countError(stats, 'UnprocessedItemsRetriesExhausted', pending.length);
        return;
      }
      stats.unprocessedResent += pending.length;
      await delay(backoffDelay(attempt));
    }

    let response;
    try {
      response = await docClient.send(new BatchWriteCommand({
        RequestItems: { [tableName]: pending }
      }));
    } catch (error) {
      stats.sdkRetries += sdkRetriesOf(error);
      if (isFatal(error)) throw new FatalWriteError(error);
      countError(stats, error.name ?? 'UnknownError', pending.length);
      return;
    }

    stats.sdkRetries += sdkRetriesOf(response);
    const unprocessed = response.UnprocessedItems?.[tableName] ?? [];
    stats.written += pending.length - unprocessed.length;
    pending = unprocessed;
  }
}
