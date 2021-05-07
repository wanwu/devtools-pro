/**
 * @file inspector 的page聚合页面
 */
import url from 'url';

import getSessionId from './utils/getSessionId';
import Home from '@components/Home.san';
let app;
const timerIdMap = new Map();
const handlers = {
    backendRemove(data) {
        if (!data.id) {
            return;
        }
        // remove 延迟
        let timerId = timerIdMap.get(data.id);
        if (timerId) {
            clearTimeout(timerId);
        }
        timerId = setTimeout(() => {
            const index = app.data.get('backends').findIndex(val => val.id === data.id);
            app.data.splice('backends', [index, 1]);
            timerIdMap.delete(data.id);
        }, 1e3);
        timerIdMap.set(data.id, timerId);
    },
    backendAppend(data) {
        const timerId = timerIdMap.get(data.id);
        if (timerId) {
            clearTimeout(timerId);
            timerIdMap.delete(data.id);
        } else {
            const index = app.data.get('backends').findIndex(val => val.id === data.id);
            if (index > -1) {
                app.data.splice('backends', [index, 1, data]);
            } else {
                app.data.unshift('backends', data);
            }
        }
    },
    backendUpdate(data) {
        handlers.backendAppend(data);
    }
};

const sid = getSessionId();
const wsUrl = url.format({
    protocol: location.protocol === 'https:' ? 'wss:' : 'ws:',
    hostname: location.hostname,
    port: process.env.NODE_ENV === 'production' ? location.port : 8899,
    pathname: `/home/${sid}`
});

const ws = new window.WebSocket(wsUrl);
ws.onopen = () => {
    // 绿色
    app.data.set('status', 'connected');

    ws.onmessage = e => {
        let data = e.data;
        data = JSON.parse(data);
        const handler = handlers[data.event];
        if (typeof handler === 'function') {
            handler(data.payload);
        }
    };
};
ws.onerror = e => {
    // 红色
    app.data.set('status', 'error');
    console.error(e);
};
ws.onclose = () => {
    // 灰色
    app.data.set('status', 'disconnected');
};

app = new Home();
app.attach(document.querySelector('#root'));
