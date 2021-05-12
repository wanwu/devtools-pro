/**
 * @file inspector 的page聚合页面
 */
import url from 'url';

import getSessionId from './utils/getSessionId';
import Home from '@components/Home.san';
import {getPlatform} from './utils/getUaInfo';
import MobileDetect from 'mobile-detect';
import createFrontendUrl from './utils/createFrontendUrl';

const ANDROID = 0;
const IOS = 1;
const DESKTOP = 2;
const UNKNOW = 3;
// 开发的时候是 webpack 特殊处理
const PORT = process.env.NODE_ENV === 'production' ? location.port : 8899;

let app;
const timerIdMap = new Map();
const handlers = {
    backendDisconnected(data) {
        if (!data.id) {
            return;
        }
        // remove 延迟
        let timerId = timerIdMap.get(data.id);
        if (timerId) {
            clearTimeout(timerId);
        }
        const index = app.data.get('backends').findIndex(val => val.id === data.id);
        if (index < 0) {
            return;
        }
        timerId = setTimeout(() => {
            app.data.splice('backends', [index, 1]);
            timerIdMap.delete(data.id);
        }, 1e3);
        timerIdMap.set(data.id, timerId);
    },
    backendConnected(data) {
        if (!data || !data.id) {
            return;
        }

        // 获取设备类型
        if (!data.metaData) {
            data.metaData = {userAgent: '', platform: ''};
        }
        const metaData = data.metaData;
        const userAgent = metaData.userAgent;
        // https://github.com/hgoebl/mobile-detect.js
        const md = MobileDetect(userAgent);
        const {system} = getPlatform(metaData.userAgent);
        let type = UNKNOW;
        if (system === 'windows' || system === 'macos' || system === 'linux') {
            type = DESKTOP;
        } else if (system === 'ios') {
            type = IOS;
        } else if (system === 'android') {
            type = ANDROID;
        }
        // 获取app和appVersion

        metaData.type = type;
        data.devtoolsurl = createFrontendUrl(location.protocol, location.hostname, PORT, data.id);

        // 插入数据
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
        handlers.backendConnected(data);
    },
    homeConnected(data) {
        if (!data) {
            return;
        }
        app.data.set('wsPort', PORT);
        app.data.set('wsHost', location.hostname);
        app.data.set(
            'backendjs',
            url.format({
                protocol: location.protocol,
                hostname: location.hostname,
                // 开发的时候是 webpack 特殊处理
                port: PORT,
                pathname: `/backend.js`
            })
        );
    }
};

const sid = getSessionId();
const wsUrl = url.format({
    protocol: location.protocol === 'https:' ? 'wss:' : 'ws:',
    hostname: location.hostname,
    port: PORT,
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
