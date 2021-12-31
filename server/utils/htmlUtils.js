// inspired by html-webpack-plugin
const {createHtmlTagObject, htmlTagObjectToString, HtmlTagArray} = require('./htmlTags');

/**
   * Html Post processing
   *
   * @param {any} html
   * The input html
   * @param {any} assets
   * @param {{
       headTags: HtmlTagObject[],
       bodyTags: HtmlTagObject[]
     }} assetTags
   * The asset tags to inject
   *
   * @returns {Promise<string>}
   */
function postProcessHtml(html, assets, assetTags) {
    if (typeof html !== 'string') {
        return Promise.reject(new Error('Expected html to be a string but got ' + JSON.stringify(html)));
    }
    const htmlAfterInjection = injectAssetsIntoHtml(html, assets, assetTags);
    return Promise.resolve(htmlAfterInjection);
}

/**
 * Add toString methods for easier rendering
 * inside the template
 *
 * @param {Array<HtmlTagObject>} assetTagGroup
 * @param {Boolean} xhtml If true render the link tags as self-closing (XHTML compliant)
 * @returns {Array<HtmlTagObject>}
 */
function prepareAssetTagGroupForRendering(assetTagGroup, xhtml = false) {
    return HtmlTagArray.from(
        assetTagGroup.map(assetTag => {
            const copiedAssetTag = Object.assign({}, assetTag);
            copiedAssetTag.toString = function() {
                return htmlTagObjectToString(this, xhtml);
            };
            return copiedAssetTag;
        })
    );
}
/**
   * Injects the assets into the given html string
   *
   * @param {string} html
   * @param {Boolean} xhtml If true render the link tags as self-closing (XHTML compliant)
   * The input html
   * @param {any} assets
   * @param {{
       headTags: HtmlTagObject[],
       bodyTags: HtmlTagObject[]
     }} assetTags
   * The asset tags to inject
   *
   * @returns {string}
   */
function injectAssetsIntoHtml(html, assets, assetTags, xhtml = false) {
    const htmlRegExp = /(<html[^>]*>)/i;
    const headRegExp = /(<\/head\s*>)/i;
    const bodyRegExp = /(<\/body\s*>)/i;
    const body = (assetTags.bodyTags || []).map(assetTagObject => htmlTagObjectToString(assetTagObject, xhtml));
    const head = (assetTags.headTags || []).map(assetTagObject => htmlTagObjectToString(assetTagObject, xhtml));

    if (body.length) {
        if (bodyRegExp.test(html)) {
            // Append assets to body element
            html = html.replace(bodyRegExp, match => body.join('') + match);
        } else {
            // Append scripts to the end of the file if no <body> element exists:
            html += body.join('');
        }
    }

    if (head.length) {
        // Create a head tag if none exists
        if (!headRegExp.test(html)) {
            if (!htmlRegExp.test(html)) {
                html = '<head></head>' + html;
            } else {
                html = html.replace(htmlRegExp, match => match + '<head></head>');
            }
        }

        // Append assets to head element
        html = html.replace(headRegExp, match => head.join('') + match);
    }

    // Inject manifest into the opening html tag
    if (assets.manifest) {
        html = html.replace(/(<html[^>]*)(>)/i, (match, start, end) => {
            // Append the manifest only if no manifest was specified
            if (/\smanifest\s*=/.test(match)) {
                return match;
            }
            return start + ' manifest="' + assets.manifest + '"' + end;
        });
    }
    return html;
}
module.exports = {
    postProcessHtml,
    injectAssetsIntoHtml,
    prepareAssetTagGroupForRendering,

    createHtmlTagObject,
    htmlTagObjectToString,
    HtmlTagArray
};
