const url = require('url');
const querystring = require('querystring');

const WebSocket = require('ws');
const ChannelMultiplex = require('./websocket/ChannelMultiplex');
const logger = require('./utils/logger');
const Manager = require('./websocket/Manager');

module.exports = class WebSocketServer {
    constructor(serverInstance) {
        this.serverInstance = serverInstance;
        // this.isSSL = serverInstance.isSSL();
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
                    const backendData = this.getChannelManager().getBackends();
                    this.manager.send({payload: backendData, event: 'homeConnected'});
                    const foxy = this.getChannelManager().getFoxy();
                    if (foxy && foxy.length) {
                        this.manager.send({payload: foxy, event: 'updateFoxyInfo'});
                    }
                    break;
                case 'heartbeat':
                    this.manager.createChannel(ws);
                    break;
            }
        });
    }
    getFrontendById(id) {
        return this.channelManager.getFrontendChannelById(id);
    }
    getBackendById(id) {
        return this.channelManager.getBackendById(id);
    }
    getFrontends() {
        return this.channelManager.getFrontends();
    }
    getBackends() {
        return this.channelManager.getBackends();
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
        // const isSSL = this.isSSL;
        const socketPaths = ['backend', 'frontend', 'home', 'heartbeat'];
        server.on('upgrade', function(request, socket, head) {
            const urlObj = url.parse(request.url);
            const [_, role, id = ''] = urlObj.pathname.split('/');
            const q = querystring.parse(urlObj.query) || {};

            logger.debug('upgrade', role, id);

            if (socketPaths.indexOf(role) !== -1) {
                wss.handleUpgrade(request, socket, head, ws => {
                    ws.role = role;
                    ws.id = id;
                    ws.port = socket.localPort;
                    ws.host = socket.remoteAddress;
                    ws.hidden = q.hidden;

                    wss.emit('connection', ws, request);
                });
            } else {
                socket.destroy();
            }
        });
    }
};
