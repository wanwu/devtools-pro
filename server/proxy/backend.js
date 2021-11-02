const WebSocket = require('ws');
module.exports = url => {
    const ws = new WebSocket(url);
    return new Promise((resolve, reject) => {
        ws.on('open', function open() {
            // 发送给home信息
            ws.send('something');
            // 添加成功监听，返回websocket实例
            resolve(ws);
        });

        ws.on('message', function incoming(message) {
            console.log('received: %s', message);
        });
    });
};
