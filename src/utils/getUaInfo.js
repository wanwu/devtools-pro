/**
 * @file
 */
export function getPlatform(userAgent) {
    const ua = userAgent.toLowerCase();
    const testUa = regexp => regexp.test(ua);
    // 系统
    let system = 'unknow';
    if (testUa(/windows|win32|win64|wow32|wow64/g)) {
        system = 'windows'; // windows系统
    } else if (testUa(/macintosh|macintel/g)) {
        system = 'macos'; // macos系统
    } else if (testUa(/x11/g)) {
        system = 'linux'; // linux系统
    } else if (testUa(/android|adr/g)) {
        system = 'android'; // android系统
    } else if (testUa(/ios|iphone|ipad|ipod|iwatch/g)) {
        system = 'ios'; // ios系统
    }
    let platform = 'unknow';
    if (system === 'windows' || system === 'macos' || system === 'linux') {
        platform = 'desktop'; // 桌面端
    } else if (system === 'android' || system === 'ios' || testUa(/mobile/g)) {
        platform = 'mobile'; // 移动端
    }
    return {
        platform,
        system
    };
}
