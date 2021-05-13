const EventEmitter = require('events').EventEmitter;
const chalk = require('chalk');
const logger = require('consola');

const {truncate, getColorfulName} = require('../utils');
const Channel = require('./Channel');

module.exports = class ChannelMultiplex extends EventEmitter {
    constructor() {
        super();
        this._backendMap = new Map();
        this._frontendMap = new Map();
    }
    destory() {
        const destoryChannel = ({channel}) => channel && channel.destory && channel.destory();
        this.getBackends().forEach(destoryChannel);
        this.getFrontends().forEach(destoryChannel);
        this._backendMap.clear();
        this._frontendMap.clear();
    }
    createBackendChannel(id, ws) {
        // hidden是否通知到home
        const {hidden = false} = ws;
        const channel = new Channel(ws, 'backend');
        logger.debug(`${getColorfulName('backend')} ${chalk.green('connected')} ${id}`);
        const backendData = {
            id,
            get alive() {
                return channel && channel.isAlive();
            },
            channel
        };
        this._backendMap.set(id, backendData);
        // 接收信息进行处理
        const onMessage = e => {
            try {
                const {event, payload} = JSON.parse(e);
                switch (event) {
                    case 'updateBackendInfo':
                        // 更新title等信息
                        if (payload && payload.id) {
                            const data = this._backendMap.get(payload.id);
                            if (data && payload) {
                                for (let [key, value] of Object.entries(payload)) {
                                    data[key] = value;
                                }
                                this._backendMap.set(payload.id, data);
                            }
                            !hidden && this.emit('backendUpdate', data);
                        }
                        break;
                }
            } catch (e) {}
        };
        channel.on('message', onMessage);
        channel.on('close', () => {
            logger.debug(`${getColorfulName('backend')} ${id} close`);
            channel.off('message', onMessage);
            this.removeBackendChannel(id);
        });
        !hidden && this.emit('backendConnected', backendData);
    }
    createFrontendChannel(id, ws) {
        const backendChannel = this._backendMap.get(id);
        if (!backendChannel || !backendChannel.channel) {
            // 这种情况是没有backend channel， frontend先于backend打开；或者backend关闭，frontend刷新
            // eslint-disable-next-line max-len
            return ws.close();
        }

        const channel = new Channel(ws, 'frontend');
        logger.debug(
            // eslint-disable-next-line max-len
            `${getColorfulName('frontend')} ${chalk.green('connected')} ${id} to backend ${
                backendChannel.id
            }:${truncate(backendChannel.title, 10)}`
        );
        channel.connect(backendChannel.channel);
        const frontendData = {
            id,
            backendId: backendChannel.id,
            channel
        };
        const mapId = `${backendChannel.id}-${id}`;
        const oldChannelData = this._frontendMap.get(mapId);
        if (oldChannelData && oldChannelData.channel && oldChannelData.channel.destroy) {
            // 一个类型保持一个
            oldChannelData.channel.destroy();
        }
        this._frontendMap.set(mapId, frontendData);
        channel.on('close', () => this.removeFrontendChannel(mapId));
        backendChannel.channel.on('close', () => channel.destroy());

        this.emit('frontendAppend', frontendData);
    }
    removeBackendChannel(id) {
        logger.debug(`${getColorfulName('backend')} ${chalk.red('disconnected')} ${id}`);
        this._backendMap.delete(id);
        this.emit('backendDisconnected', {id});
    }
    removeFrontendChannel(id) {
        logger.debug(`${getColorfulName('frontend')} ${chalk.red('disconnected')} ${id}`);
        this._frontendMap.delete(id);
        this.emit('frontendRemove', {id});
    }
    getBackendById(id) {
        return this._backendMap.get(id);
    }
    getBackends() {
        return Array.from(this._backendMap.values());
    }
    getFrontends() {
        return Array.from(this._frontendMap.values());
    }
};
