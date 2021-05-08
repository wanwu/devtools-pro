const fs = require('fs');
const logger = require('lighthouse-logger');
// const chalk = require('chalk');

const log = logger.loggerfn('sendFileStreamToResponse');

module.exports = function sendFileStreamToResponse(absoluteFilePath, ctx) {
    log(absoluteFilePath);
    const stream = fs.createReadStream(absoluteFilePath, {start: 0});
    ctx.body = stream;
    // response finished, done with the fd
    stream.on('data', chunks => {
        console.log(chunks);
    });
    // error
    stream.on('error', err => {
        console.log(err);
        throw err;
    });
};
