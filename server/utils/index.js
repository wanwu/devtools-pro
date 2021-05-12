const chalk = require('chalk');
const {BACKENDJS_PATH, FRONTEND_PATH} = require('../constants');

exports.truncate = function truncate(txt, width = 10) {
    if (!txt) {
        return '';
    }
    const ellipsis = '...';
    const len = txt.length;
    if (width > len) {
        return txt;
    }
    let end = width - ellipsis.length;
    if (end < 1) {
        return ellipsis;
    }
    return txt.slice(0, end) + ellipsis;
};
function getColorfulName(role) {
    role = role.toUpperCase();
    switch (role) {
        case 'FRONTEND':
            return chalk.blue(role);
        case 'BACKEND':
            // 为了对齐
            return chalk.yellow('BACK_END');
        case 'HOME':
            return chalk.magenta(role);
        case 'GET':
            return chalk.green(role);
    }
    return chalk.cyan(role);
}
exports.getColorfulName = getColorfulName;
