/**
 * @file logger
 * @author wangyongqing <wangyongqing01@baidu.com>
 */

const color = require('colorette');

const path = require('path');
const figures = require('figures');
const LogLevel = {};
LogLevel[(LogLevel.Fatal = 0)] = 'Fatal';
LogLevel[(LogLevel.Error = 0)] = 'Error';
LogLevel[(LogLevel.Warn = 1)] = 'Warn';
LogLevel[(LogLevel.Info = 2)] = 'Info';
LogLevel[(LogLevel.Success = 3)] = 'Success';
LogLevel[(LogLevel.Debug = 4)] = 'Debug';
LogLevel[(LogLevel.Silent = -Infinity)] = 'Silent';
LogLevel[(LogLevel.Verbose = Infinity)] = 'Verbose';

const TYPE_ICONS = {
    info: figures.info,
    success: figures.tick,
    debug: figures.pointerSmall,
    warn: figures.warning,
    error: color.bgRed(' ERROR '),
    fatal: color.bgRed(' FATAL '),
    log: ''
};
const TYPE_COLOR_MAP = {
    info: 'cyan',
    warn: 'yellow',
    success: 'green',
    error: 'black',
    fatal: 'black',
    debug: 'magenta'
};

class Logger {
    constructor(level = 3) {
        this._level = level;
    }
    setLevel(level) {
        if ((typeof level === 'string' && LogLevel[level]) || typeof level === 'number') {
            this._level = typeof level === 'number' ? level : LogLevel[level];
        }
    }

    debug(...args) {
        if (this._level < LogLevel.Debug) {
            return;
        }
        this.log(this._formatType('debug'), ...args);
    }

    info(...args) {
        if (this._level < LogLevel.Info) {
            return;
        }
        this.log(this._formatType('info'), ...args);
    }
    success(...args) {
        if (this._level < LogLevel.Success) {
            return;
        }
        this.log(this._formatType('success'), ...args);
    }

    log(...args) {
        // eslint-disable-next-line no-console
        console.log(...args);
    }

    warn(...args) {
        if (this._level < LogLevel.Warn) {
            return;
        }
        this.log(this._formatType('warn'), ...args);
    }

    error(...args) {
        if (this._level < LogLevel.Error) {
            return;
        }
        this._logError(args);
    }

    fatal(...args) {
        if (this._level < LogLevel.Fatal) {
            return;
        }
        // this.log(red('FATAL'), ...args);
        this._logError(args, 'fatal');
    }
    _formatType(type) {
        const colorFn = TYPE_COLOR_MAP[type] && color[TYPE_COLOR_MAP[type]] ? color[TYPE_COLOR_MAP[type]] : s => s;
        const _type = typeof TYPE_ICONS[type] === 'string' ? TYPE_ICONS[type] : '';
        return _type ? colorFn(_type) : '';
    }
    _formatStack(stack) {
        const {cyan, gray} = color;
        /* eslint-disable */
        return (
            '\n' +
            this._parseStack(stack)
                .map(line => '  ' + line.replace(/^at +/, m => gray(m)).replace(/\((.+)\)/, (_, m) => `(${cyan(m)})`))
                .join('\n')
        );
    }
    _parseStack(stack) {
        const cwd = process.cwd() + path.sep;

        const lines = stack
            .split('\n')
            .splice(1)
            .map(l =>
                l
                    .trim()
                    .replace('file://', '')
                    .replace(cwd, '')
            );

        return lines;
    }
    _logError(args, label = 'error') {
        args.map(e => {
            if (typeof e === 'object' && e instanceof Error) {
                this.log(this._formatType(label), e.message, this._formatStack(e.stack));
            } else {
                this.log(e);
            }
        });
    }
}
module.exports = new Logger();
module.exports.LogLevel = LogLevel;
module.exports.Logger = Logger;
