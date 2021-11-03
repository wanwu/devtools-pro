const {nanoid} = require('nanoid');
const mime = require('mime-types');
const CDPClient = require('./CDPClient');
const client = new CDPClient();
module.exports = async function CDPMessager(wsUrl, proxyServer) {
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
            const message = messagerFormatter(event, conn, extInfo);
            client.sendCommand(method, message);
        });
    });
};

const messageHandler = {
    'Network.getResponseBody': (message, client) => {
        const {id, params} = message;
        console.log('--->', id, params);
    }
};
function cdpMessagerReceiver(client) {
    client.on('message', message => {
        const {method} = message;
        if (messageHandler[method]) {
            messageHandler[method](message, client);
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
                type: getResourceType(response.getHeader('content-type'), request.url),
                response: {
                    url: request.url,
                    status: response.statusCode,
                    statusText: response.statusMessage,
                    headers: response.headers,
                    mimeType: response.getHeader('content-type') || '',
                    connectionReused: true,
                    connectionId: '0',
                    encodedDataLength: parseInt(response.getHeader('content-length'), 10),
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

function getResourceType(contentType, path) {
    if (contentType && contentType.match) {
        contentType = contentType.toLowerCase();
        if (contentType.match(/application/)) {
            const newContentType = mime.lookup(path);
            if (newContentType) {
                contentType = newContentType;
            }
        }
        if (contentType.match('text/css')) {
            return 'Stylesheet';
        }
        if (contentType.match('text/html')) {
            return 'Document';
        }
        if (contentType.match('/(x-)?javascript')) {
            return 'Script';
        }
        if (contentType.match('image/')) {
            // TODO svg图片处理 image/svg+xml
            return 'Image';
        }
        if (contentType.match('video/')) {
            return 'Media';
        }
        if (contentType.match('font/') || contentType.match('/(x-font-)?woff')) {
            return 'Font';
        }
        if (contentType.match('/(json|xml)')) {
            return 'XHR';
        }
    }

    return 'Other';
    // 'XHR', 'Fetch', 'EventSource', 'Script', 'Stylesheet', 'Image', 'Media', 'Font', 'Document', 'TextTrack', 'WebSocket', 'Other', 'SourceMapScript', 'SourceMapStyleSheet', 'Manifest', 'SignedExchange'
}
