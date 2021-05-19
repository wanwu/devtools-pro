import url from 'url';
import {nanoid} from 'nanoid';

import WebSocket from './lib/WebSocket';
import getCurrentScript from './utils/getCurrentScript';
// 1. 获取getCurrentScript，得到host
const curScriptUrl = getCurrentScript();
const {protocol, hostname, port} = new URL(curScriptUrl);

class Runtime {
    constructor(chobitsu) {
        const listeners = (this._listeners = new Map());
        this._chobitsu = chobitsu;
        chobitsu.registerMethod('$Bridge.messageChannel', ({event, payload}) => {
            const handler = listeners.get(event);
            if (handler && typeof handler === 'function') {
                const result = handler(payload);
                // 返回result
                return result ? {result} : {};
            } else {
                throw Error(`${event} unimplemented`);
            }
        });
    }
    /**
     * 获取消息通道命名空间，返回on/emit
     * @param {string} ns
     * @returns
     */
    namespace(ns) {
        const self = this;
        const register = self.registerEvent.bind(self);
        const sendCommand = self.sendCommand.bind(self);
        return {
            on(method, handler) {
                register(`${ns}.${method}`, handler);
            },
            emit(method, params) {
                sendCommand(`${ns}.${method}`, params);
            }
        };
    }
    getChromeDomain(domainName) {
        const self = this;
        const register = self._registerMethod.bind(self);
        const sendCommand = self._sendCommand.bind(self);
        return {
            on(method, handler) {
                register(`${domainName}.${method}`, handler);
            },
            emit(method, params) {
                sendCommand(`${domainName}.${method}`, params);
            }
        };
    }
    /**
     * 注册frontend监听函数
     * @param {string} event 事件名
     * @param {function} handler 监听函数，handler返回数据在frontend会被立即接收
     */
    registerEvent(event, handler) {
        this._listeners.set(event, handler);
    }
    /**
     * 给frontend发送数据
     * @param {string} cmd 命令名
     * @param {*} params 参数
     * @returns
     */
    sendCommand(cmd, params) {
        this._chobitsu.trigger('$Bridge.messageChannel', {event: cmd, payload: params});
        return this;
    }
    createWebsocketConnection(wsurl) {
        return new WebSocket(wsurl);
    }
    // hidden：默认是不会通知home的
    createWebsocketUrl(pathname, query = {hidden: 1}) {
        // if (!pathname) {
        //     pathname = `/backend/${nanoid()}`;
        // }
        return url.format({
            protocol: protocol === 'https:' ? 'wss:' : 'ws:',
            hostname,
            port: process.env.NODE_ENV === 'production' ? port : 8899,
            pathname,
            query
        });
    }
    createUrl(pathname, query) {
        return url.format({
            protocol: protocol === 'https:' ? 'wss:' : 'ws:',
            hostname,
            port: process.env.NODE_ENV === 'production' ? port : 8899,
            pathname,
            query
        });
    }
    nanoid() {
        return nanoid();
    }

    _registerMethod(method, fn) {
        this._chobitsu.registerMethod(method, fn);
    }
    // 发送domain事件
    _sendCommand(method, params) {
        this._chobitsu.trigger(method, params);
    }
}

export default function createRuntime(chobitsu) {
    const $devtools = (self.$devtools = new Runtime(chobitsu));
    return $devtools;
}
