const https = require('https');

const parseOptions = require('./options').parseOptions;
const uuidv1 = require('uuid/v1');
const delay = require('delay');
const AWS = require('aws-sdk');

const getRandomEntity = require('./db').getRandomEntity;

let docClient;

function getRandomLatLon() {
  return {
    lat: 42.0 + Math.random()*2,
    lon: 2.1 + Math.random()*2
  }
}

async function writeBatch(tableName, numberOfItems) {
    const putRequests = [];
    for (let i=0; i < numberOfItems; i++) {
      const item = {
        uuid : uuidv1(),
        timestamp : Date.now() + Math.random(),
        entity : getRandomEntity(),
        latLon  : getRandomLatLon()
      };
      const aPutRequest = {
        PutRequest: {
         Item: item
        }
      };
      putRequests.push(aPutRequest);
    }
    const params = { RequestItems: {}};
    params.RequestItems[tableName] = putRequests;

    return docClient.batchWrite(params).promise();
}

async function writeItemBurst(tableName, numberOfItems) {
  const promises = [];
  for (let i=0; i < numberOfItems; i=i+25) {
    const numberOfItemsInBurst =  numberOfItems - i > 25 ? 25 : numberOfItems -i;
    //console.debug(`Writing items ${i} to ${i+numberOfItemsInBurst-1} of ${numberOfItems}.`);
    let promise = writeBatch(tableName, numberOfItemsInBurst);
    promises.push(promise);
  }
  return Promise.all(promises);
}

async function loop(tableName, numberOfSeconds, pressure) {
  for (let i=0; i < numberOfSeconds; i++) {
    console.info(`Loop iteration number ${i+1}.`);
    let t0 = Date.now();
    await writeItemBurst(tableName, pressure);
    let tf = Date.now();
    console.info(`${pressure} items written in ${tf-t0}ms.`);
    await delay(1000 - (tf-t0));
  }
}

(async () => {
    const options = parseOptions();
    const agent = new https.Agent({
      keepAlive: true,
      maxSockets: 150,
      rejectUnauthorized: true
    });

    AWS.config.update({
      region : options.region,
      httpOptions : { agent },
      retryDelayOptions: {
        customBackoff: function(retryCount) {
          console.log(`Exponential backoff triggered.`);
          return 50*retryCount;
        }
      }
    });
    docClient = new AWS.DynamoDB.DocumentClient();
    console.info(`Starting application. Writing ${options.pressure} items each second for ${options.seconds} `+ 
                 `seconds in ${options.region}/${options.table}.`);
    await loop(options.table, options.seconds, options.pressure);
    console.info('All done.');
  })();
  
