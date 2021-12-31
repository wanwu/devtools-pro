/**
 * @file inspector 的page聚合页面
 */
import url from 'url';

import getSessionId from './utils/getSessionId';
import Home from '@components/Home.san';
import {getPlatform} from './utils/getUaInfo';
import MobileDetect from 'mobile-detect';
import createFrontendUrl from './utils/createFrontendUrl';

const ANDROID = 'android';
const IOS = 'apple';
const DESKTOP = 'desktop';
const UNKNOW = 'frown';

const baiduImg = 'https://b.bdstatic.com/searchbox/icms/searchbox/img/baiduapp-logo.png';
const wechatImg = 'https://weixin.qq.com/zh_CN/htmledition/images/wechat_logo_109.2x219536.png';

const APP_IMG_MAP = {
    baiduboxapp: baiduImg,
    wechat: wechatImg
};

// 开发的时候是 webpack 特殊处理
const PORT = process.env.NODE_ENV === 'production' ? location.port : 8899;

/**
 * 为data增加额外数据信息
 * @param {*} data channel数据
 * @returns
 */
function normalizeData(data) {
    if (!data || !data.id || !data.url) {
        return null;
    }

    // 获取设备类型
    if (!data.metaData) {
        data.metaData = {userAgent: '', platform: ''};
    }
    const metaData = data.metaData;
    const userAgent = metaData.userAgent || '';
    const {system} = getPlatform(userAgent);
    let platform = UNKNOW;
    if (system === 'windows' || system === 'macos' || system === 'linux') {
        platform = DESKTOP;
    } else if (system === 'ios') {
        platform = IOS;
    } else if (system === 'android') {
        platform = ANDROID;
    }
    // console.log(platform);
    // app 信息 https://github.com/hgoebl/mobile-detect.js
    const mobileInfo = new MobileDetect(userAgent);
    const appName = mobileInfo.userAgent();
    const appImg = appName && APP_IMG_MAP[appName.toLowerCase()];
    if (appImg) {
        const appVersion = mobileInfo.versionStr(appName);
        metaData.appInfo = {
            app: appName,
            img: appImg,
            version: appVersion
        };
    }

    metaData.platform = platform;
    if (data.isFoxy) {
        data.devtoolsurl = createFrontendUrl(
            location.protocol,
            location.hostname,
            PORT,
            data.id,
            'devtools/network.html',
            data.url
        );
    } else {
        data.devtoolsurl = createFrontendUrl(location.protocol, location.hostname, PORT, data.id, undefined, data.url);
    }
    return data;
}

let app;
const timerIdMap = new Map();
const handlers = {
    updateFoxyInfo(data) {
        if (Array.isArray(data)) {
            data.map(item => {
                handlers.updateFoxyInfo(item);
            });
            return;
        }
        data = normalizeData(data);
        if (!data) {
            return;
        }
        if (data.isFoxy && data.foxyInfo) {
            app.data.set('foxy', data);
            return false;
        }
    },
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
    backendConnected(source) {
        if (Array.isArray(source)) {
            const data = source.map(normalizeData).filter(d => {
                if (d.isFoxy && d.foxyInfo) {
                    app.data.set('foxy', d);
                    return false;
                }
                return !d.hidden;
            });
            app.data.set('backends', data);
            return;
        }

        let data = normalizeData(source);
        if (!data) {
            return;
        }
        // 插入数据
        const timerId = timerIdMap.get(data.id);
        if (timerId) {
            clearTimeout(timerId);
            timerIdMap.delete(data.id);
        } else if (!data.isFoxy) {
            // 不是foxy
            const index = app.data.get('backends').findIndex(val => val.id === data.id);
            if (index > -1) {
                app.data.splice('backends', [index, 1, data]);
            } else {
                app.data.unshift('backends', data);
            }
        } else if (data.isFoxy && data.foxyInfo) {
            app.data.set('foxy', data);
        }
    },
    backendUpdate(data) {
        handlers.backendConnected(data);
    },
    homeConnected(data) {
        if (!data) {
            return;
        }
        handlers.backendConnected(data);

        app.data.set('wsPort', PORT);
        app.data.set('wsHost', location.hostname);
        app.data.set(
            'backendjs',
            url.format({
                protocol: location.protocol,
                hostname: location.hostname,
                // 开发的时候是 webpack 特殊处理
                port: PORT,
                pathname: '/backend.js'
            })
        );
    },
    connectedChannel(data) {
        handlers.backendConnected(data);
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
