const color = require('colorette');
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
            return color.blue(role);
        case 'BACKEND':
            // 为了对齐
            return color.yellow('BACK_END');
        case 'HOME':
            return color.magenta(role);
        case 'GET':
            return color.green(role);
    }
    return color.cyan(role);
}
exports.getColorfulName = getColorfulName;
