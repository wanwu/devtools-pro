import {nanoid} from 'nanoid';
const key = '$remote_devtools_sid$';
const sessionStorage = window.sessionStorage;
export default (useCache = true) => {
    let sessionId;
    if (useCache) {
        sessionId = sessionStorage.getItem(key);
        if (sessionId) {
            return sessionId;
        }
    }

    sessionId = nanoid();
    if (useCache) {
        sessionStorage.setItem(key, sessionId);
    }
    return sessionId;
};
