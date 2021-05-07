class CDPError extends Error {
    constructor(msg, type, stack) {
        super(msg || 'CDP error');
        this.name = `CDP${type ? ':' + type : ''}`;
        if ((stack && typeof stack === 'string') || Array.isArray(stack)) {
            this.stack = Array.isArray(stack) ? stack.join('\n') : stack;
        } else {
            Error.captureStackTrace(this, CDPError);
        }
    }
}
export default CDPError;
