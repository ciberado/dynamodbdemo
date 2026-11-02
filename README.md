# DynamoDB performance demo

This simple example will write tones of items to your dynamodb table.

Requires Node.js 20 or later.

## Table creation

Ensure the partition key is named `uuid` and its type is `string`. A sort key is also mandatory, with the name `timestamp` and the type `number`.

```bash
export AWS_DEFAULT_REGION=eu-west-1
aws dynamodb create-table \
  --table-name pokemondb \
  --attribute-definitions 'AttributeName=uuid, AttributeType=S' 'AttributeName=timestamp, AttributeType=N' \
  --key-schema 'AttributeName=uuid, KeyType=HASH' 'AttributeName=timestamp, KeyType=RANGE' \
  --billing-mode PAY_PER_REQUEST \
  --warm-throughput 'WriteUnitsPerSecond=10000'

watch aws dynamodb describe-table --table-name pokemondb --query '[Table.TableStatus, Table.WarmThroughput]'
```

A new *on demand* table can instantly handle up to 4,000 write units per second (its default
[warm throughput](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/warm-throughput.html)).
If you want to test higher pressures from the first second, pre-warm the table with `--warm-throughput`
as shown above (wait until `WarmThroughput.Status` is `ACTIVE`). Omit it to see how the table scales by itself.
Keep in mind that pre-warming is billed and that warm throughput values can't be decreased afterwards.

## Execution

```bash
git clone https://github.com/ciberado/dynamodbdemo && cd dynamodbdemo
npm install

node index.js  -t pokemondb -s 60 -p 5000 -r eu-west-1
```

Each iteration reports the items actually written, the failed ones, the effective rate, and how many
retries were needed (by the SDK, and resends of `UnprocessedItems`). A summary is printed at the end.
The process exits with code `1` if any item could not be written, and `2` if the run was aborted by a
non-recoverable error (missing table, invalid credentials, etc.).

## Clean up

```bash
aws dynamodb delete-table --table-name pokemondb
```
