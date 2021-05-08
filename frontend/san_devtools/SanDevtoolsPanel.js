export class SanDevtoolsPanel extends UI.VBox {
    constructor() {
        super('san_devtools');
        this.registerRequiredCSS('san_devtools/san_devtools.css', {enableLegacyPatching: false});
        this.contentElement.classList.add('html', 'san-devtools');
    }

    wasShown() {
        this._createIFrame();
    }

    willHide() {
        this.contentElement.removeChildren();
    }

    // onResize(...args) {
    //     console.log(this.contentElement);
    //     console.log(this);
    // }

    // onLayout(...args) {
    //     console.log(this.contentElement);
    //     console.log(this);
    // }

    // ownerViewDisposed(...args) {
    //     console.log(args);
    // }
    _createIFrame() {
        // We need to create iframe again each time because contentDocument
        // is deleted when iframe is removed from its parent.
        this.contentElement.removeChildren();
        const iframe = document.createElement('iframe');
        iframe.className = 'san-devtools-frame';
        iframe.setAttribute('src', 'https://www.baidu.com');
        iframe.tabIndex = -1;
        UI.ARIAUtils.markAsPresentation(iframe);
        this.contentElement.appendChild(iframe);
    }
}
