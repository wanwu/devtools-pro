const mime = require('mime-types');

module.exports = function getResourceType(contentType, path) {
    if (contentType && contentType.match) {
        contentType = contentType.toLowerCase();
        if (contentType.match(/application/)) {
            const newContentType = mime.lookup(path);
            if (newContentType) {
                contentType = newContentType;
            }
        }
        if (contentType.match('text/css')) {
            return 'Stylesheet';
        }
        if (contentType.match('text/html')) {
            return 'Document';
        }
        if (contentType.match('/(x-)?javascript')) {
            return 'Script';
        }
        if (contentType.match('image/')) {
            // TODO svg图片处理 image/svg+xml
            return 'Image';
        }
        if (contentType.match('video/')) {
            return 'Media';
        }
        if (contentType.match('font/') || contentType.match('/(x-font-)?woff')) {
            return 'Font';
        }
        if (contentType.match('/(json|xml)')) {
            return 'XHR';
        }
    }

    return 'Other';
    // 'XHR', 'Fetch', 'EventSource', 'Script', 'Stylesheet', 'Image', 'Media', 'Font', 'Document', 'TextTrack', 'WebSocket', 'Other', 'SourceMapScript', 'SourceMapStyleSheet', 'Manifest', 'SignedExchange'
};
