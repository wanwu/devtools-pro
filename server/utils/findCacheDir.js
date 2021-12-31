const os = require('os');
const fs = require('fs');
const path = require('path');
const findCacheDir = require('find-cache-dir');
const {name: pkgName} = require('../../package.json');
module.exports = (name, thunk) => {
    if (!name) {
        name = './';
    }
    /**
     *
     * const thunk = findCacheDir({name: 'foo', thunk: true});
        thunk();
        //=> '/some/path/node_modules/.cache/foo'

        thunk('bar.js')
        //=> '/some/path/node_modules/.cache/foo/bar.js'

        thunk('baz', 'quz.js')
        //=> '/some/path/node_modules/.cache/foo/baz/quz.js'
     */
    const cacheDir = findCacheDir({name: path.join(pkgName, name), create: true, thunk});
    if (!cacheDir) {
        // 不存在则自己尝试创建，注意这里的位置跟find-cache-dir的不一样
        const cachePath = path.join(os.tmpdir(), name);
        let cacheDirExists = fs.existsSync(cachePath);
        if (!cacheDirExists) {
            fs.mkdirSync(cachePath, {recursive: true});
        }
        if (thunk) {
            return (...args) => {
                return path.join(cachePath, ...args);
            };
        }
        return cacheDir;
    }
    return cacheDir;
};
