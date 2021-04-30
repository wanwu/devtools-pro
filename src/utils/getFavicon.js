export default function getFavicon() {
    const selectors = [
        'link[rel=apple-touch-icon-precomposed][href]',
        'link[rel=apple-touch-icon][href]',
        'link[rel="shortcut icon"][href]',
        'link[rel=icon][href]',
        'meta[name=msapplication-TileImage][content]',
        'meta[name=twitter\\:image][content]',
        'meta[property=og\\:image][content]'
    ];
    let url = '';

    selectors.find(selector => {
        const $node = document.querySelector(selector);
        if ($node) {
            switch ($node.tagName) {
                case 'LINK':
                    url = $node.href;

                    break;
                case 'META':
                    url = $node.content;
                    if (url) {
                        return url;
                    }
                    break;
            }
        }
        if (url) {
            return true;
        }
        return false;
    });
    if (url) {
        return url;
    }
    return '';
}
