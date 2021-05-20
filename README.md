# DynamoDB performance demo

This simple example will write tones of items to your dynamodb table.

## Table creation

Ensure the primary key is named `uuid` and its type is `string`. An order index is also mandatory, with the name `timestamp` and the type `number`.

```bash
export AWS_DEFAULT_REGION=eu-west-1
aws dynamodb create-table \
  --table-name database \
  --attribute-definitions 'AttributeName=uuid, AttributeType=S' 'AttributeName=timestamp, AttributeType=N' \
  --key-schema 'AttributeName=uuid, KeyType=HASH' 'AttributeName=timestamp, KeyType=RANGE' \
  --provisioned-throughput 'ReadCapacityUnits=5, WriteCapacityUnits=10000' 
  
watch aws dynamodb describe-table --table-name database --query Table.TableStatus

aws dynamodb update-table --table-name database --billing-mode PAY_PER_REQUEST

watch aws dynamodb describe-table --table-name database --query Table.TableStatus
```

In order to properly use *on demand capacity* create the table with the desired **provisioned** capacity and then change to *on demand*. Any other way you will find the initial real performance is not the desired.

## Execution

```bash
git clone https://github.com/ciberado/dynamodbdemo && cd dynamodbdemo
npm install

node index.js  -t database -s 60 -p 5000 -r eu-west-1
```

## Clean up

```bash
aws dynamodb delete-table --table-name database
```
