const {nanoid} = require('nanoid');
const colorette = require('colorette');
const logger = require('../utils/logger');

const Channel = require('./Channel');
const {getColorfulName} = require('../utils');

module.exports = class HomeChannel {
    constructor(wssInstance) {
        this.wssInstance = wssInstance;
        this.heartBeatsWs = [];
        this._channels = [];
        this._addListeners();
    }
    createChannel(ws, id = nanoid()) {
        const channel = new Channel(ws);
        logger.debug(`${getColorfulName('manager')} ${id} ${colorette.green('connected')}`);
        const channelData = {
            id,
            channel
        };
        this._channels.push(channelData);

        channel.on('close', () => this.removeChannel(id));
    }

    _addListeners() {
        const channelManager = this.wssInstance.getChannelManager();
        // TODO update
        channelManager.on('backendUpdate', data => {
            this.send({payload: data, event: 'backendUpdate'});
        });
        channelManager.on('backendConnected', data => {
            this.send({payload: data, event: 'backendConnected'});
        });
        channelManager.on('backendDisconnected', data => {
            this.send({payload: data, event: 'backendDisconnected'});
        });
    }
    removeChannel(id) {
        logger.debug(`${getColorfulName('manager')} ${id} ${colorette.red('disconnected')}`);
        const idx = this._channels.findIndex(c => c.id === id);
        this._channels.splice(idx, 1);
    }
    // 广播事件
    send(message) {
        this._channels.forEach(c => c.channel.send(message));
    }
    destroy() {
        this._channels.forEach(c => c.channel.destroy());
        this._channels.length = 0;
    }
};
