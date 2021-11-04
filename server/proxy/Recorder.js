const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const LRU = require('lru-cache');
// const EventEmitter = require('events').EventEmitter;
const iconv = require('iconv-lite');
const logger = require('../utils/logger');
const findCacheDir = require('../utils/findCacheDir');
const getResourceType = require('../utils/getResourceType');

const BODY_FILE_PRFIX = 'res_body_';
const CACHE_DIR_PREFIX = 'cache_record';
class Recorder {
    constructor() {
        this.cachePath = findCacheDir(CACHE_DIR_PREFIX);
        // 最多30_000个
        this.lru = new LRU({
            max: 30_000,
            maxAge: 1000 * 60 * 60
        });
    }
    addRecord(conn) {
        const {request, response} = conn;
        const filepath = this.updateResponseBody(conn);
        const contentType = response.getHeader('content-type');
        const isBinary = response.type === 'bin';
        this.lru.set(conn.getId() + '', {
            id: conn.getId(),
            url: request.url,
            isBinary,
            type: getResourceType(contentType, request.url),
            contentType,
            filepath
        });
    }
    updateResponseBody(conn) {
        const id = conn.getId();
        const {response} = conn;
        if (!id || typeof response.body === 'undefined') {
            return;
        }
        const filename = this.getCacheFile(BODY_FILE_PRFIX + id);
        fs.writeFile(filename, response.body, err => {
            err && console.error(err);
        });
        return filename;
    }
    async getRecord(id) {
        if (!id) {
            return {};
        }
        const filename = this.getCacheFile(BODY_FILE_PRFIX + id);
        const record = this.lru.get(id);
        if (!record) {
            logger.warn(`record is empty or expire:${id}`);
            return {
                body: '',
                base64Encoded: false
            };
        }
        return new Promise((resolve, reject) => {
            fs.access(filename, fs.F_OK || fs.R_OK, err => {
                if (err) {
                    if (err.code === 'ENOENT') {
                        resolve({
                            ...record,
                            body: '',
                            base64Encoded: false
                        });
                    } else {
                        reject(err);
                    }
                } else {
                    fs.readFile(filename, (err, data) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({
                                ...record,
                                ...this.getEncodedBody(record, data)
                            });
                        }
                    });
                }
            });
        });
    }
    getEncodedBody(record, body) {
        const {contentType, isBinary, type} = record;

        const charsetMatch = contentType.match(/charset='?([a-zA-Z0-9-]+)'?/);
        if (charsetMatch && charsetMatch[1] && ['XHR', 'Fetch', 'Script', 'Stylesheet', 'Document'].includes(type)) {
            const currentCharset = charsetMatch[1].toLowerCase();
            if (currentCharset !== 'utf-8' && iconv.encodingExists(currentCharset)) {
                body = iconv.decode(body, currentCharset);
            }
            return {
                body: body.toString(),
                base64Encoded: false
            };
        }
        if (((contentType && /image/i.test(contentType)) || isBinary) && Buffer.isBuffer(body)) {
            return {
                body: body.toString('base64'),
                base64Encoded: true
            };
        }

        return {
            body: body.toString(),
            base64Encoded: false
        };
    }
    getCacheFile(filename) {
        return path.join(this.cachePath, filename);
    }
    clean() {
        logger.log();
        logger.info('delete response recorder cache...');
        try {
            fse.removeSync(this.cachePath);
            // 清理lru cache
            this.lru.reset();
            // 重建cache dir
            this.cachePath = findCacheDir(CACHE_DIR_PREFIX);
            logger.success('success!');
        } catch (e) {
            logger.error(e);
        }
    }
}

module.exports = Recorder;
