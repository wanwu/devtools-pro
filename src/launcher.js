/**
 * @file 放到被调试页面的laucher
 */
import url from 'url';

import chobitsu from '@ksky521/chobitsu';

import getFavicon from './utils/getFavicon';
import WebSocket from './lib/WebSocket';
import getCurrentScript from './utils/getCurrentScript';
import getSessionId from './utils/getSessionId';

// 1. 获取getCurrentScript，得到host
const curScriptUrl = getCurrentScript();
const {protocol, hostname, port} = new URL(curScriptUrl);

// 2. 得到sid
const sid = getSessionId();

// 得到ws地址
const backendWSURL = url.format({
    protocol: protocol === 'https:' ? 'wss:' : 'ws:',
    hostname,
    port: process.env.NODE_ENV === 'production' ? port : 8899,
    pathname: `/backend/${sid}`
});
// 3. 建立连接
const wss = new WebSocket(backendWSURL);

wss.on('message', event => {
    chobitsu.sendRawMessage(event.data);
});

chobitsu.setOnMessage(message => {
    wss.send(message);
});

// 第一次发送
sendRegisterMessage();
// 第二次更新
window.addEventListener('onload', sendRegisterMessage);

function sendRegisterMessage() {
    const favicon = getFavicon();
    const title = document.title || 'Untitled';
    const {userAgent, platform} = navigator;
    wss.send('updateBackendInfo', {
        id: sid,
        favicon,
        title,
        metaData: {userAgent, platform},
        url: location.href
    });
}
