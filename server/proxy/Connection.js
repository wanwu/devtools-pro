/**
 * 每个请求的connection对象
 */

let id = 1;
const genId = () => id++;

module.exports = class Connection {
    constructor() {
        this._id = genId();
        this.timing = {
            start: Date.now()
        };
        this._request = null;
        this._respones = null;
        this._requestBody = null;
        this._responesBody = null;
        this._resourceType = 'Other';
    }
    setRequest(req) {}
    setResponse(res) {}
    getId() {
        return this._id;
    }
    close() {
        this._request = null;
        this._respones = null;
        this._requestBody = null;
        this._responesBody = null;
    }
    getTiming() {
        return this._timing;
    }
};
