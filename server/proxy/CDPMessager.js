const {nanoid} = require('nanoid');
const CDPClient = require('./CDPClient');
const getResourceType = require('../utils/getResourceType');
const Recorder = require('./Recorder');
const debug = require('../utils/createDebug')('CDPMessager');
const client = new CDPClient();
const recorder = new Recorder();
const proxyEventHandler = {
    loadingFinished: conn => {
        // 添加记录，存入缓存
        recorder.addRecord(conn);
    }
};

const messageHandler = {
    'Network.getResponseBody': async (message, client) => {
        const {id, params} = message;
        const record = await recorder.getRecord(params.requestId).catch(() => {});
        client.sendResult(id, {
            body: record.body,
            base64Encoded: record.base64Encoded
        });
    },
    'Network.getRequestPostData': async (message, client) => {
        // TODO
        const {id, params} = message;
        client.sendResult(id, {postData: '1111'});
    },
    'Page.canScreencast': (message, client) => {
        client.sendResult(message.id, false);
    },
    'Network.canEmulateNetworkConditions': (message, client) => {
        client.sendResult(message.id, false);
    },
    'Emulation.canEmulate': (message, client) => {
        client.sendResult(message.id, false);
    }
};
async function CDPMessager(wsUrl, proxyServer) {
    const sid = nanoid();
    cdpMessagerReceiver(client);

    await client.connect(`${wsUrl}backend/${sid}`);

    client.sendRawMessage(
        JSON.stringify({
            event: 'updateBackendInfo',
            payload: {
                // TODO 添加一个Cool favicon
                id: sid,
                title: 'Devtools Foxy',
                url: 'https://github.com/ksky521'
            }
        })
    );

    // 发送一条测试信息
    [
        'requestWillBeSent',
        'responseReceived',
        'dataReceived',
        'loadingFinished',
        'webSocketClosed',
        'webSocketCreated',
        'webSocketFrameError',
        'webSocketFrameReceived',
        'webSocketFrameSent',
        'webSocketHandshakeResponseReceived',
        'webSocketWillSendHandshakeRequest'
    ].forEach(event => {
        proxyServer.on(event, (conn, extInfo) => {
            // console.log(event, conn.request.url);
            const method = `Network.${event}`;
            if (proxyEventHandler[event]) {
                proxyEventHandler[event](conn);
            }
            const message = messagerFormatter(event, conn, extInfo);
            client.sendCommand(method, message);
        });
    });
}
CDPMessager.close = () => {
    recorder && recorder.clean();
};
module.exports = CDPMessager;
function cdpMessagerReceiver(client) {
    client.on('message', message => {
        const {method} = message;
        if (messageHandler[method]) {
            messageHandler[method](message, client);
        } else {
            debug(`Unhandled message: ${method}`);
            client.sendResult(message.id, {});
        }
    });
}

// cdp 协议格式化
function messagerFormatter(type, connection, extInfo) {
    const timing = connection.getTiming();
    const {request, response} = connection;
    let message;
    switch (type) {
        case 'requestWillBeSent':
            message = {
                // https://chromedevtools.github.io/devtools-protocol/tot/Network/#event-requestWillBeSent
                requestId: `${connection.getId()}`,
                loaderId: '23.1',
                documentURL: 'https://github.com/ksky521',
                request: {
                    url: request.url,
                    method: 'GET',
                    headers: request.headers,
                    initialPriority: 'High',
                    mixedContentType: 'none',
                    postData: request.body
                },
                timestamp: timing.start,
                wallTime: timing.wallTime,
                initiator: {
                    type: 'other'
                },
                type: getResourceType(request.getHeader('content-type'), request.url)
            };
            break;
        case 'responseReceived':
            message = {
                requestId: `${connection.getId()}`,
                loaderId: '23.1',
                timestamp: timing.responseReceived,
                type: getResourceType(response.type, request.url),
                response: {
                    url: request.url,
                    status: response.statusCode,
                    statusText: response.statusMessage,
                    headers: response.headers,
                    mimeType: response.type || '',
                    connectionReused: true,
                    connectionId: '0',
                    encodedDataLength: response.length,
                    fromDiskCache: false,
                    fromServiceWorker: false,
                    fromPrefetchCache: false,
                    requestHeaders: request.headers
                }
            };
            break;
        case 'dataReceived':
            message = {
                requestId: `${connection.getId()}`,
                timestamp: extInfo.time,
                dataLength: extInfo.length,
                encodedDataLength: extInfo.encodedLength
            };
            break;
        case 'loadingFinished':
            message = {
                requestId: `${connection.getId()}`,
                timestamp: timing.responseFinished,
                encodedDataLength: parseInt(response.getHeader('content-length'), 10)
            };
            break;
        case 'webSocketClosed':
            break;
        case 'webSocketCreated':
            break;
        case 'webSocketFrameError':
            break;
        case 'webSocketFrameReceived':
            break;
        case 'webSocketFrameSent':
            break;
        case 'webSocketHandshakeResponseReceived':
            break;
        case 'webSocketWillSendHandshakeRequest':
            break;
    }
    return message;
}
