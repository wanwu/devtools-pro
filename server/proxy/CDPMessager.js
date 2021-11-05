const {nanoid} = require('nanoid');
const CDPClient = require('./CDPClient');
const getResourceType = require('../utils/getResourceType');
const Recorder = require('./Recorder');
const debug = require('../utils/createDebug')('CDPMessager');
const getTime = require('../utils/getTime');
const {BLOCKING_IGNORE_STRING} = require('../constants');
// let client;
const recorder = new Recorder();
const proxyEventHandler = {
    loadingFinished: conn => {
        // 添加记录，存入缓存
        recorder.addRecord(conn);
    }
};
let proxyServerInstance;
// 来自backend的消息处理
const messageHandler = {
    // 私建的消息通道
    '$Bridge.messageChannel': async (message, client) => {
        const {id, params} = message;
        messageHandler[params.event](params.payload, client);
    },
    // 主动在html/htm页面注入backend.js
    'Networks.setAutoInjectBackend': async (message, client) => {
        if (!proxyServerInstance && !proxyServerInstance.stopBlocking) {
            return;
        }
        const {autoInject} = message;
        proxyServerInstance.setAutoInjectBackendjs(autoInject);
    },
    'Networks.toggleRecord': async (message, client) => {
        if (!proxyServerInstance && !proxyServerInstance.stopBlocking) {
            return;
        }
        const {toggled} = message;
        // 记录
        if (toggled) {
            // 开始，通知proxyServer开启拦截
            proxyServerInstance.startBlocking();
        } else {
            // 停止拦截
            proxyServerInstance.stopBlocking();
        }
    },
    'Networks.clearCache': async (message, client) => {
        recorder.clean();
    },
    'Network.getResponseBody': async (message, client) => {
        const {id, params} = message;
        const record = await recorder.getRecord(params.requestId).catch(() => {});
        if (record.code && record.message) {
            client.sendResult(id, {
                code: record.code,
                message: record.message
            });
        } else {
            client.sendResult(id, {
                body: record.body,
                base64Encoded: record.base64Encoded
            });
        }
    },
    'Network.getRequestPostData': async (message, client) => {
        // TODO
        const {id, params} = message;
        // client.sendResult(id, {postData: '1111'});
    },
    // TODO 禁用缓存
    // {"id":3,"method":"Network.setCacheDisabled","params":{"cacheDisabled":true}}
    'Page.canScreencast': (message, client) => {
        client.sendResult(message.id, false);
    },
    // TODO 网络限制
    // {"id":4,"method":"Network.emulateNetworkConditions","params":{"offline":false,"latency":562.5,"downloadThroughput":188743.68000000002,"uploadThroughput":86400,"connectionType":"cellular3g"}}
    'Network.canEmulateNetworkConditions': (message, client) => {
        client.sendResult(message.id, false);
    },
    'Emulation.canEmulate': (message, client) => {
        client.sendResult(message.id, false);
    }
};
async function CDPMessager(wsUrl, proxyServer) {
    proxyServerInstance = proxyServer;
    const sid = nanoid();
    const client = new CDPClient();
    cdpMessagerReceiver(client);
    const id = `${BLOCKING_IGNORE_STRING}-${sid}`;

    client.on('open', () => {
        client.sendRawMessage(
            JSON.stringify({
                event: 'updateFoxyInfo',
                payload: {
                    // 标识
                    isFoxy: true,
                    foxyInfo: {
                        port: proxyServer.port,
                        address: proxyServer.address
                    },
                    id
                }
            })
        );
    });

    // warn @blocking_ignore@ 不捕捉这个请求
    await client.connect(`${wsUrl}backend/${id}?hidden=1`);

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
            if (message) {
                client.sendCommand(method, message);
            }
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
    if (!connection) {
        return;
    }
    const timing = connection.getTiming();
    const {request, response} = connection;
    if (!request || !connection.getId() || !connection.isBlockable()) {
        return;
    }
    let message;
    switch (type) {
        case 'requestWillBeSent':
            message = {
                // https://chromedevtools.github.io/devtools-protocol/tot/Network/#event-requestWillBeSent
                requestId: `${connection.getId()}`,
                loaderId: '23.1',
                documentURL: 'https://github.com/ksky521',
                request: {
                    url: request.fullUrl || request.url,
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
                    url: request.fullUrl || request.url,
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
            message = {
                requestId: `${connection.getId()}`,
                timestamp: getTime()
            };
            break;
        case 'webSocketCreated':
            message = {
                requestId: `${connection.getId()}`,
                url: request.fullUrl || request.url
            };
            break;
        case 'webSocketFrameError':
            break;
        case 'webSocketFrameReceived':
            let rbody = extInfo.body;
            if (Buffer.isBuffer(rbody)) {
                rbody = rbody.toString();
            }
            message = {
                requestId: `${connection.getId()}`,
                response: {
                    opcode: 1,
                    //
                    mask: false,
                    // WebSocket message payload data. If the opcode is 1,
                    // this is a text message and payloadData is a UTF-8 string.
                    // If the opcode isn't 1, then payloadData is a base64 encoded string representing binary data.
                    payloadData: rbody
                },
                timestamp: getTime()
            };
            break;
        case 'webSocketFrameSent':
            let sbody = extInfo.body;
            if (Buffer.isBuffer(sbody)) {
                sbody = sbody.toString();
            }
            message = {
                requestId: `${connection.getId()}`,
                response: {
                    opcode: 1,
                    //
                    mask: false,
                    // WebSocket message payload data. If the opcode is 1,
                    // this is a text message and payloadData is a UTF-8 string.
                    // If the opcode isn't 1, then payloadData is a base64 encoded string representing binary data.
                    payloadData: sbody
                },
                timestamp: getTime()
            };
            break;
        case 'webSocketHandshakeResponseReceived':
            message = {
                requestId: `${connection.getId()}`,
                response: {
                    status: 101,
                    statusText: 'Switching Protocols',
                    headers: response.headers
                },
                timestamp: getTime()
            };
            break;
        case 'webSocketWillSendHandshakeRequest':
            message = {
                requestId: `${connection.getId()}`,
                request: {
                    headers: request.headers
                },
                timestamp: timing.start,
                wallTime: timing.wallTime
            };
            break;
    }
    return message;
}
