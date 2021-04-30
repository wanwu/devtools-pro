function setDefaultValue(key, defaultValue, storage = window.localStorage) {
  try {
    const setting = JSON.parse(storage.getItem(key));
    if (setting === null) {
      storage.setItem(key, JSON.stringify(defaultValue));
    }
  } catch (ex) {
    console.log('Fail to run `setDefaultValue`', { ex, key, defaultValue });
  }
}

// The default value of `screencastEnabled` is `true`, here we change it to `false` to keep DevTools clean
// and also send `Overlay.hideHighlight` command to the target when mouse moves out of the element tree.
// @link https://github.com/ChromeDevTools/devtools-frontend/blob/e4d64e7ae0f7d449ce3f8b1364b28362baae4c80/front_end/screencast/ScreencastApp.js#L20
setDefaultValue('screencastEnabled', false);
