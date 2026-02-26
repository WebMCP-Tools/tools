// ============================================================
// Test Helpers — Mock fetch factory for handler testing
// ============================================================

/**
 * Creates a mock context with a configurable fetch function.
 * Routes are defined as { method, path } → response mappings.
 *
 * @param {string} baseUrl - Base URL for the mock context
 * @param {Array<{ method?: string, path: string|RegExp, status?: number, body: any, text?: string }>} routes
 * @param {object} [options] - Additional context fields (apiKey, username, etc.)
 * @returns {{ baseUrl: string, fetch: function, calls: Array }}
 */
export function createMockContext(baseUrl, routes = [], options = {}) {
    const calls = [];

    async function mockFetch(url, init = {}) {
        const method = (init.method || 'GET').toUpperCase();
        const parsedUrl = new URL(url);
        const path = parsedUrl.pathname + parsedUrl.search;

        calls.push({ method, url, path: parsedUrl.pathname, search: parsedUrl.search, init });

        // Find matching route
        const route = routes.find((r) => {
            const routeMethod = (r.method || 'GET').toUpperCase();
            if (routeMethod !== method) return false;

            if (r.path instanceof RegExp) return r.path.test(parsedUrl.pathname);
            return parsedUrl.pathname === r.path || parsedUrl.pathname.startsWith(r.path);
        });

        if (!route) {
            return {
                ok: false,
                status: 404,
                statusText: 'Not Found',
                json: async () => ({ error: 'Not found', url }),
                text: async () => `Not found: ${url}`,
            };
        }

        const status = route.status || 200;
        return {
            ok: status >= 200 && status < 300,
            status,
            statusText: status === 200 ? 'OK' : `Error ${status}`,
            json: async () => route.body,
            text: async () => route.text || JSON.stringify(route.body),
        };
    }

    return {
        baseUrl,
        fetch: mockFetch,
        calls,
        ...options,
    };
}

/**
 * Creates a context that always returns errors.
 */
export function createErrorContext(baseUrl, status = 500, message = 'Internal Server Error') {
    return createMockContext(baseUrl, [{
        method: 'GET',
        path: '/',
        status,
        body: { error: message },
    }]);
}
