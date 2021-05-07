/**
 * @file 放到被调试页面的laucher
 */
import url from 'url';

import chobitsu from 'chobitsu';

import getFavicon from './utils/getFavicon';
import WebSocket from './lib/WebSocket';
import getCurrentScript from './utils/getCurrentScript';
import getSessionId from './utils/getSessionId';

// 1. 获取getCurrentScript，得到host
const curScriptUrl = getCurrentScript();
const {host, protocol, hostname, port} = new URL(curScriptUrl);
// 2. 得到sid
const sid = getSessionId();
const favicon = getFavicon();
const title = document.title || 'Untitled';
// 得到ws地址
const backendWSURL = url.format({
    protocol: protocol === 'https:' ? 'wss:' : 'ws:',
    hostname,
    port: process.env.NODE_ENV === 'production' ? port : 8899,
    pathname: `/backend/${sid}`
});
// 3. 建立连接
const wss = new WebSocket(backendWSURL);
const devtoolsChannel = wss.registerChannel('devtools');

devtoolsChannel.on('message', event => {
    chobitsu.sendRawMessage(event.data);
});

chobitsu.setOnMessage(message => {
    devtoolsChannel.send(message);
});

// 第一次发送
devtoolsChannel.send('updateBackendInfo', {
    id: sid,
    favicon,
    title,
    url: location.href
});
window.addEventListener('onload', () => {
    // 补充更新，存在document.title更新情况
    devtoolsChannel.send('updateBackendInfo', {
        id: sid,
        favicon: getFavicon(),
        title: document.title || 'Untitled',
        url: location.href
    });
});
