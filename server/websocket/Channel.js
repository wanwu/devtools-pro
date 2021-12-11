const EventEmitter = require('events').EventEmitter;
const {getColorfulName, truncate} = require('../utils');
const debug = require('../utils/createDebug')('websocket');
const normalizeWebSocketPayload = require('../utils/normalizeWebSocketPayload');

const {stringify} = require('circular-json');
const STATUS_OPENING = 'opening';
const STATUS_CLOSED = 'closed';
const STATUS_DESTROYED = 'destroyed';
module.exports = class Channel extends EventEmitter {
    constructor(ws, name = 'anonymous') {
        super();
        this.status = STATUS_OPENING;
        this._ws = ws;
        this._name = name;
        this._connections = [];

        const onMessage = message => {
            debug(`${getColorfulName(this._ws.role)} ${this._ws.id} Get Message`, truncate(message, 50));
            // 下面是frontend 发送给backend用的数据
            // const channelMessage = `@${this._name}\n${message}`;
            // backend connections为空
            this._connections.forEach(connection => {
                connection.send(message);
            });
            // 通过派发事件，将数据发送出去，结合 this.connect 实现来看
            this.emit('message', message);
        };
        const onClose = (...args) => {
            this.status = STATUS_CLOSED;
            this.emit('close', ...args);
            this.destroy();
            ws.off('close', onClose);
            ws.off('message', onMessage);
            debug(`${getColorfulName(this._ws.role)} ${this._ws.id} Closed, errno:${args[0]}`);
        };
        ws.on('close', onClose);
        ws.on('message', onMessage);
    }
    isAlive() {
        return this.status === STATUS_OPENING;
    }
    send(message) {
        if (typeof message === 'object') {
            message = normalizeWebSocketPayload(message);
            message = stringify(message);
        }
        debug(`${getColorfulName(this._ws.role)} ${this._ws.id} Send Message`, truncate(message, 50));
        this._ws.send(message);
    }
    destroy() {
        this._connections.forEach(connection => {
            connection.removeAllListeners('message');
            connection.removeAllListeners('close');
        });

        this._connections = [];
        this._ws.close();
        this.status = STATUS_DESTROYED;
    }
    isConnected(connection) {
        if (this.hasConnection(connection)) {
            return true;
        }
        if (connection && connection.hasConnection(this)) {
            return true;
        }

        return false;
    }
    hasConnection(connection) {
        return this._connections.some(item => item === connection);
    }
    connect(connection) {
        // connection = backend channel instance
        if (this.isConnected(connection)) {
            return;
        }
        // 这里是frontend connect backend，backend被压入connections
        this._connections.push(connection);
        // backend 通过 message event 获取数据，并且发送出去
        connection.on('message', message => {
            this.send(message);
        });
        connection.on('close', () => this.disconnect(connection));
    }
    disconnect(connection) {
        if (!this.isConnected(connection)) {
            return;
        }

        if (this.hasConnection(connection)) {
            remove(this._connections, item => item === connection);
            connection.off('message', this.send);
        } else {
            connection.disconnect(this);
        }
    }
};

function remove(arr, iterator) {
    const ret = [];
    let i = -1;
    let len = arr.length;

    while (++i < len) {
        const val = arr[i];

        if (iterator(val, i, arr)) {
            ret.push(val);
            arr.splice(i, 1);
        }
    }

    return ret;
}
