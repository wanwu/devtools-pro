module.exports = function getResourceType(contentType) {
    if (contentType && contentType.match) {
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
        // ws?
    }

    return 'Other';
};
