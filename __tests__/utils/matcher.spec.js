const matcher = require('../../server/utils/matcher');

const reqLocal = {
    host: '127.0.0.1',
    port: '8080',
    headers: {
        ['User-Agent']: 'chrome baiduboxapp 12.0/1'
    }
};
describe('match useragent', () => {
    it('useragent', () => {
        expect(
            matcher(
                {
                    headers: {
                        ['User-Agent']: /baiduboxapp/
                    }
                },
                reqLocal
            )
        ).toBe(true);
    });
    it('useragent lowercase', () => {
        expect(
            matcher(
                {
                    headers: {
                        ['user-agent']: /baiduboxapp/
                    }
                },
                reqLocal
            )
        ).toBe(true);
    });
});
describe('matcher', () => {
    const req = {
        host: 'devtools.pro',
        port: 80,
        path: '/ssl',
        url: '/ssl'
    };
    const reqBackend = {
        host: 'devtools.pro',
        port: 80,
        path: '/',
        url: '/backend.js?ab=1'
    };
    // path === path
    it('simple path', () => {
        expect(matcher('/ssl', req)).toBe(true);
        expect(matcher(/^\/s/, req)).toBe(true);
    });

    it('string', () => {
        expect(
            matcher(
                {
                    host: 'devtools.pro'
                },
                req
            )
        ).toBe(true);
        expect(
            matcher(
                {
                    host: 'devtools.pro',
                    url: '/'
                },
                req
            )
        ).toBe(false);

        expect(
            matcher(
                {
                    host: 'devtools.pro',
                    url: '/ssl'
                },
                req
            )
        ).toBe(true);
        expect(
            matcher(
                {
                    host: 'devtools.pro',
                    url: '/backend.js'
                },
                req
            )
        ).toBe(false);
    });

    it('regx', () => {
        expect(
            matcher(
                {
                    host: 'devtools.pro',
                    url: /^\/backend\.js*/
                },
                reqBackend
            )
        ).toBe(true);

        expect(
            matcher(
                {
                    host: 'devtools.pro',
                    url: /^\/backend\.js*/
                },
                reqBackend
            )
        ).toBe(true);
    });

    it('glob', () => {
        expect(
            matcher(
                {
                    host: 'devtools.pro',
                    url: '/backend*'
                },
                reqBackend
            )
        ).toBe(true);
    });
});
