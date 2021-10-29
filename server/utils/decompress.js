const zlib = require('zlib');

module.exports = (responseBody, res) => {
    const contentEncoding = (res.headers['content-encoding'] || res.headers['Content-Encoding'] || '').toLowerCase();
    const contentLength = Buffer.byteLength(responseBody);

    if (!['gzip', 'deflate', 'br'].includes(contentEncoding) || !contentLength) {
        return Promise.resolve(responseBody);
    }
    // 删除encoding header
    delete res.headers['content-encoding'];
    delete res.headers['Content-Encoding'];

    return new Promise((resolve, reject) => {
        const callback = (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        };
        switch (contentEncoding) {
            case 'gzip':
                zlib.gunzip(responseBody, callback);
                break;
            case 'deflate':
                zlib.inflate(responseBody, callback);
                break;
            case 'br':
                zlib.brotliDecompress(responseBody, callback);
                break;
        }
    });
};
