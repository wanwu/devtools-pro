const Server = require('./server/Server');
const WebSocketServer = require('./server/WebSocketServer');
const ProxyServer = require('./server/ProxyServer');
// const localMock = require('./server/interceptors/localMock');
// const pathWrite = require('./server/interceptors/pathWrite');
// const userAgent = require('./server/interceptors/userAgent');
module.exports = {
    Server,
    WebSocketServer,
    ProxyServer
};
