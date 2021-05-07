import Bridge from '@lib/Bridge';

export default function(ws) {
    const messageListeners = [];

    ws.on('message', event => {
        let data;
        try {
            if (typeof event.data === 'string') {
                data = JSON.parse(event.data);
            } else {
                throw Error();
            }
        } catch (e) {
            console.error(`[Remote Devtools] Failed to parse JSON: ${event.data}`);
            return;
        }
        messageListeners.forEach(fn => {
            try {
                fn(data);
            } catch (error) {
                // jsc doesn't play so well with tracebacks that go into eval'd code,
                // so the stack trace here will stop at the `eval()` call. Getting the
                // message that caused the error is the best we can do for now.
                console.log('[Remote Devtools] Error calling listener', data);
                console.log('error:', error);
                throw error;
            }
        });
    });

    return new Bridge({
        listen(fn) {
            messageListeners.push(fn);
            return () => {
                const index = messageListeners.indexOf(fn);
                if (index >= 0) {
                    messageListeners.splice(index, 1);
                }
            };
        },
        send(data) {
            ws.sendRawMessage(JSON.stringify(data));
        }
    });
}
