import {nanoid} from 'nanoid';
const key = '$devtools_sid_';
const sessionStorage = window.sessionStorage;
export default (url, useCache = true) => {
    if (!url) {
        url = location.pathname + location.search;
    }
    let sKey = `${key}${url}`;
    let sessionId;
    if (useCache) {
        sessionId = sessionStorage.getItem(sKey);
        if (sessionId) {
            return sessionId;
        }
    }

    sessionId = nanoid();
    if (useCache) {
        sessionStorage.setItem(sKey, sessionId);
    }
    return sessionId;
};
