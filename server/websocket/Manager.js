const chalk = require('chalk');
const logger = require('lighthouse-logger');

const Channel = require('./Channel');
const {getColorfulName} = require('../utils');

module.exports = class HomeChannel {
    constructor(wssInstance) {
        this.wssInstance = wssInstance;
        this._channels = [];
        this.addListeners();
    }
    createChannel(id, ws) {
        const channel = new Channel(id, ws);
        logger.info(`${getColorfulName('home')} ${id} ${chalk.green('connected')}`);
        const channelData = {
            id,
            channel
        };
        this._channels.push(channelData);

        channel.on('close', () => this.removeChannel(id));
    }

    addListeners() {
        const channelManager = this.wssInstance.getChannelManager();
        // TODO update
        channelManager.on('backendUpdate', data => {
            this.send({payload: data, event: 'backendUpdate'});
        });
        channelManager.on('backendAppend', data => {
            this.send({payload: data, event: 'backendAppend'});
        });
        channelManager.on('backendRemove', data => {
            this.send({payload: data, event: 'backendRemove'});
        });
    }
    removeChannel(id) {
        logger.info(`${getColorfulName('home')} ${id} ${chalk.red('disconnected')}`);
        const idx = this._channels.findIndex(c => c.id === id);
        this._channels.splice(idx, 1);
    }
    send(message) {
        this._channels.forEach(c => c.channel.send(message));
    }
    destroy() {
        this._channels.forEach(c => c.channel.destroy());
        this._channels.length = 0;
    }
};
