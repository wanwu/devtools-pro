export default function getCurrentScriptSource() {
    // `document.currentScript` is the most accurate way to find the current script,
    // but is not supported in all browsers.
    if (document.currentScript) {
        return document.currentScript.src;
    }
    // Fall back to getting all scripts in the document.
    const scriptElements = document.scripts || [];
    const currentScript = scriptElements[scriptElements.length - 1];

    if (currentScript) {
        return currentScript.src;
    }
    // Fail as there was no script to use.
    throw new Error('Failed to get current script source.');
}
