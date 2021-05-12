/**
 * @file 放到被调试页面的laucher
 */
import chobitsu from '@ksky521/chobitsu';
import getFavicon from './utils/getFavicon';
import getSessionId from './utils/getSessionId';
import createRuntime from './runtime';

// 初始化runtime
const runtime = createRuntime(chobitsu);
const sid = getSessionId();

// 得到ws地址
const backendWSURL = runtime.createWebsocketUrl(`/backend/${sid}`, {});

// 建立连接
const wss = runtime.createWebsocketConnection(backendWSURL);

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
// ws链接建立成功之后主动发送页面信息
wss.on('open', sendRegisterMessage);

function sendRegisterMessage() {
    const favicon = getFavicon();
    const title = document.title || 'Untitled';
    const {userAgent, platform} = navigator;
    wss.send({
        event: 'updateBackendInfo',
        payload: {
            id: sid,
            favicon,
            title,
            metaData: {userAgent, platform},
            url: location.href
        }
    });
}
