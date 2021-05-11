const url = require('url');
// const querystring = require('querystring');

const WebSocket = require('ws');
const ChannelMultiplex = require('./websocket/ChannelMultiplex');
const logger = require('lighthouse-logger');
const Manager = require('./websocket/Manager');

const {createBackendjsUrl, createFrontendUrl} = require('./utils');

module.exports = class WebSocketServer {
    constructor() {
        this.channelManager = new ChannelMultiplex();
        this.manager = new Manager(this);

        const wss = (this._wss = new WebSocket.Server({noServer: true}));

        wss.on('connection', ws => {
            const {id, role} = ws;
            switch (role) {
                case 'backend':
                    this.channelManager.createBackendChannel(id, ws);
                    break;
                case 'frontend':
                    this.channelManager.createFrontendChannel(id, ws);
                    break;
                case 'home':
                    this.manager.createChannel(ws, id);
                    break;
                case 'heartbeat':
                    this.manager.createChannel(ws);
                    break;
            }
        });
    }
    destory() {
        this.channelManager.destory();
        this.manager.destroy();
    }
    getChannelManager() {
        return this.channelManager;
    }

    init(server) {
        const wss = this._wss;
        const socketPaths = ['backend', 'frontend', 'home', 'heartbeat'];
        server.on('upgrade', function(request, socket, head) {
            const urlObj = url.parse(request.url);
            const [_, role, id = ''] = urlObj.pathname.split('/');

            logger.verbose('upgrade', role, id);

            if (socketPaths.indexOf(role) !== -1) {
                wss.handleUpgrade(request, socket, head, ws => {
                    ws.role = role;
                    ws.id = id;
                    ws.port = socket.localPort;
                    ws.host = socket.remoteAddress;

                    switch (role) {
                        case 'home': {
                            ws.backendjs = createBackendjsUrl(ws.host, ws.port);
                            break;
                        } case 'backend': {
                            ws.devtoolsurl = createFrontendUrl(ws.host, ws.port, id);
                        }
                    }

                    wss.emit('connection', ws, request);
                });
            } else {
                socket.destroy();
            }
        });
    }
};
