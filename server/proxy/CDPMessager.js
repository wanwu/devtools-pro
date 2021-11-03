const {nanoid} = require('nanoid');
const CDPClient = require('./CDPClient');
const client = new CDPClient();
module.exports = async function CDPMessager(wsUrl, proxyServer) {
    const sid = nanoid();

    await client.connect(`${wsUrl}/backend/${sid}`);

    client.sendRawMessage(
        JSON.stringify({
            event: 'updateBackendInfo',
            payload: {
                id: sid,
                title: '哈哈哈哈',
                url: 'https://badu.com'
            }
        })
    );

    // 发送一条测试信息
    ['requestWillBeSent'].forEach(event => {
        proxyServer.on(event, conn => {
            console.log(event, conn.request.url);
            client.send(`Network.${event}`, messagerFormatter(event, conn));
        });
    });
};

// cdp 协议格式化
function messagerFormatter(type, connection) {
    switch (type) {
    }
    return {
        requestId: '112',
        frameId: '123.2',
        loaderId: '123.67',
        documentURL: 'http://baidu.com',
        request: {
            url: 'http://baidu.com',
            method: 'GET',
            headers: connection.request.headers,
            initialPriority: 'High',
            mixedContentType: 'none',
            postData: connection.request.body
        },
        timestamp: Date.now(),
        wallTime: 1221222,
        initiator: {
            type: 'other'
        },
        type: 'Document'
    };
}
