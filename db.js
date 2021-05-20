const fs = require('fs');

let rawdata = fs.readFileSync('db.json');
const database = JSON.parse(rawdata);

function getRandomIndex() {
  return parseInt(Math.random() * database.length);
}    

module.exports = {
    getRandomEntity() {
        return database[getRandomIndex()];
    }
};
