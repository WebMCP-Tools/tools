// ============================================================
// Cross-Tool Error Handling & Edge Case Tests
// Validates error propagation, auth headers, and failure modes
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMockContext } from './helpers.js';

// Import all handlers
import { search_posts, get_post, list_categories, submit_comment } from '../wordpress/handler.js';
import { nuxeo_search, nuxeo_get_document, nuxeo_browse, nuxeo_create_document, nuxeo_start_workflow } from '../nuxeo/handler.js';
import { search_products, get_product, add_to_cart, get_cart, check_order_status } from '../e-commerce/handler.js';
import { search, get_page_info, submit_form, list_pages } from '../generic-website/handler.js';

const BASE = 'https://test.example.com';

// ============================================================
// Error propagation — every handler should throw descriptive errors
// ============================================================

describe('Error Propagation', () => {
    const readOnlyHandlers = [
        { name: 'wordpress/search_posts', fn: search_posts, input: { query: 'x' }, path: '/wp-json/wp/v2/posts' },
        { name: 'wordpress/get_post', fn: get_post, input: { idOrSlug: '1' }, path: '/wp-json/wp/v2/posts/1' },
        { name: 'wordpress/list_categories', fn: list_categories, input: {}, path: '/wp-json/wp/v2/categories' },
        { name: 'nuxeo/nuxeo_search', fn: nuxeo_search, input: { query: 'x' }, path: '/nuxeo/api/v1/search' },
        { name: 'nuxeo/nuxeo_get_document', fn: nuxeo_get_document, input: { idOrPath: 'abc' }, path: '/nuxeo/api/v1/id' },
        { name: 'nuxeo/nuxeo_browse', fn: nuxeo_browse, input: {}, path: '/nuxeo/api/v1/search' },
        { name: 'e-commerce/search_products', fn: search_products, input: { query: 'x' }, path: '/api/products/search' },
        { name: 'e-commerce/get_product', fn: get_product, input: { productId: 'x' }, path: '/api/products' },
        { name: 'e-commerce/get_cart', fn: get_cart, input: {}, path: '/api/cart' },
        { name: 'e-commerce/check_order_status', fn: check_order_status, input: { orderId: 'x' }, path: '/api/orders' },
        { name: 'generic-website/search', fn: search, input: { query: 'x' }, path: '/api/search' },
        { name: 'generic-website/get_page_info', fn: get_page_info, input: { path: '/' }, path: '/' },
        { name: 'generic-website/list_pages', fn: list_pages, input: {}, path: '/api/pages' },
    ];

    for (const handler of readOnlyHandlers) {
        it(`${handler.name} — should throw descriptive error on 500`, async () => {
            const ctx = createMockContext(BASE, [
                { path: handler.path, status: 500, body: { error: 'Internal error' } },
            ]);

            await assert.rejects(
                () => handler.fn(handler.input, ctx),
                (err) => {
                    assert.ok(err instanceof Error, 'Should be an Error instance');
                    assert.ok(err.message.length > 0, 'Error message should not be empty');
                    assert.ok(
                        err.message.includes('500') || err.message.includes('error') || err.message.includes('not found'),
                        `Error should mention status or be descriptive: "${err.message}"`
                    );
                    return true;
                }
            );
        });
    }

    const writeHandlers = [
        { name: 'wordpress/submit_comment', fn: submit_comment, input: { postId: '1', author: 'X', content: 'Y' }, path: '/wp-json/wp/v2/comments', method: 'POST' },
        { name: 'nuxeo/nuxeo_create_document', fn: nuxeo_create_document, input: { parentPath: '/a', type: 'File', title: 'T' }, path: '/nuxeo/api/v1/path', method: 'POST' },
        { name: 'nuxeo/nuxeo_start_workflow', fn: nuxeo_start_workflow, input: { documentId: 'abc', workflowModelName: 'wf' }, path: '/nuxeo/api/v1/id', method: 'POST' },
        { name: 'e-commerce/add_to_cart', fn: add_to_cart, input: { productId: 'x' }, path: '/api/cart/items', method: 'POST' },
        { name: 'generic-website/submit_form', fn: submit_form, input: { formId: 'contact', fields: {} }, path: '/api/forms', method: 'POST' },
    ];

    for (const handler of writeHandlers) {
        it(`${handler.name} — should throw descriptive error on 500`, async () => {
            const ctx = createMockContext(BASE, [
                { method: handler.method, path: handler.path, status: 500, body: { message: 'Server error' } },
            ]);

            await assert.rejects(
                () => handler.fn(handler.input, ctx),
                (err) => {
                    assert.ok(err instanceof Error);
                    assert.ok(err.message.length > 0);
                    return true;
                }
            );
        });
    }

    for (const handler of writeHandlers) {
        it(`${handler.name} — should extract error message from API response`, async () => {
            const ctx = createMockContext(BASE, [
                { method: handler.method, path: handler.path, status: 422, body: { message: 'Validation failed: field X is required' } },
            ]);

            await assert.rejects(
                () => handler.fn(handler.input, ctx),
                (err) => {
                    assert.ok(err instanceof Error);
                    // Should contain the API's error message, not just the status
                    assert.ok(
                        err.message.includes('Validation failed') || err.message.includes('422'),
                        `Should include API message or status: "${err.message}"`
                    );
                    return true;
                }
            );
        });
    }
});

// ============================================================
// Auth header injection
// ============================================================

describe('Auth Headers', () => {
    it('nuxeo — should send Bearer token when apiKey is provided', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/nuxeo/api/v1/search/lang/NXQL/execute', body: { entries: [], totalSize: 0, pageSize: 10, currentPageIndex: 0, numberOfPages: 0 } },
        ], { apiKey: 'secret-token' });

        await nuxeo_search({ query: 'test' }, ctx);

        const headers = ctx.calls[0].init.headers;
        assert.equal(headers['Authorization'], 'Bearer secret-token');
    });

    it('nuxeo — should send no auth header when no credentials', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/nuxeo/api/v1/search/lang/NXQL/execute', body: { entries: [], totalSize: 0, pageSize: 10, currentPageIndex: 0, numberOfPages: 0 } },
        ]);

        await nuxeo_search({ query: 'test' }, ctx);

        const headers = ctx.calls[0].init.headers || {};
        assert.equal(headers['Authorization'], undefined);
    });

    it('e-commerce — should send Bearer token when apiKey is provided', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/api/products/search', body: { products: [] } },
        ], { apiKey: 'shop-key' });

        await search_products({ query: 'shoes' }, ctx);

        const headers = ctx.calls[0].init.headers;
        assert.equal(headers['Authorization'], 'Bearer shop-key');
    });

    it('e-commerce — should send no auth header without apiKey', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/api/products/search', body: { products: [] } },
        ]);

        await search_products({ query: 'shoes' }, ctx);

        const headers = ctx.calls[0].init.headers || {};
        assert.equal(headers['Authorization'], undefined);
    });

    it('wordpress — should not send auth headers (public API)', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/wp-json/wp/v2/posts', body: [] },
        ]);

        await search_posts({ query: 'test' }, ctx);

        // WordPress handler should not inject auth (it's public)
        assert.equal(ctx.calls[0].init.headers, undefined);
    });
});

// ============================================================
// Edge cases & robustness
// ============================================================

describe('Edge Cases', () => {
    it('wordpress/search_posts — should default limit to 10', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/wp-json/wp/v2/posts', body: [] },
        ]);

        await search_posts({ query: 'test' }, ctx);
        assert.ok(ctx.calls[0].url.includes('per_page=10'));
    });

    it('wordpress/search_posts — should handle empty category lookup', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/wp-json/wp/v2/categories', body: [] },// No category found
            { path: '/wp-json/wp/v2/posts', body: [] },
        ]);

        const result = await search_posts({ query: 'test', category: 'nonexistent' }, ctx);
        assert.deepEqual(result, []);
    });

    it('nuxeo/nuxeo_search — should cap pageSize at 100', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/nuxeo/api/v1/search/lang/NXQL/execute', body: { entries: [], totalSize: 0, pageSize: 100, currentPageIndex: 0, numberOfPages: 0 } },
        ]);

        await nuxeo_search({ query: 'test', pageSize: 999 }, ctx);
        assert.ok(ctx.calls[0].url.includes('pageSize=100'));
    });

    it('nuxeo/nuxeo_browse — should default to /default-domain', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/nuxeo/api/v1/search/lang/NXQL/execute', body: { entries: [] } },
        ]);

        await nuxeo_browse({}, ctx);
        assert.ok(ctx.calls[0].url.includes('default-domain'));
    });

    it('e-commerce/add_to_cart — should default quantity to 1', async () => {
        const ctx = createMockContext(BASE, [
            { method: 'POST', path: '/api/cart/items', body: { item_count: 1, total: 10 } },
        ]);

        await add_to_cart({ productId: 'x' }, ctx);

        const body = JSON.parse(ctx.calls[0].init.body);
        assert.equal(body.quantity, 1);
    });

    it('e-commerce/get_cart — should handle empty items array', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/api/cart', body: { items: [], total: 0, item_count: 0 } },
        ]);

        const result = await get_cart({}, ctx);
        assert.equal(result.items.length, 0);
        assert.equal(result.itemCount, 0);
    });

    it('generic-website/search — should default limit to 10', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/api/search', body: { results: [] } },
        ]);

        await search({ query: 'test' }, ctx);
        assert.ok(ctx.calls[0].url.includes('limit=10'));
    });

    it('generic-website/get_page_info — should handle minimal HTML', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/bare', body: null, text: '<html><body>Bare page</body></html>' },
        ]);

        const result = await get_page_info({ path: '/bare' }, ctx);
        assert.equal(result.title, '');
        assert.equal(result.description, '');
        assert.equal(result.headings.length, 0);
    });
});

// ============================================================
// Response mapping resilience
// ============================================================

describe('Response Mapping Resilience', () => {
    it('e-commerce/search_products — should handle flat array response', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/api/products/search', body: [{ id: '1', name: 'Shoe', price: 50 }] },
        ]);

        const result = await search_products({ query: 'shoe' }, ctx);
        assert.equal(result.length, 1);
        assert.equal(result[0].name, 'Shoe');
    });

    it('e-commerce/get_product — should handle missing optional fields', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/api/products/minimal', body: { id: '1', name: 'Basic' } },
        ]);

        const result = await get_product({ productId: 'minimal' }, ctx);
        assert.equal(result.id, '1');
        assert.ok(Array.isArray(result.variants));
        assert.ok(Array.isArray(result.tags));
    });

    it('generic-website/list_pages — should handle alternative field names', async () => {
        const ctx = createMockContext(BASE, [
            {
                path: '/api/pages',
                body: [
                    { title: 'About', url: '/about', category: 'info', updated_at: '2026-01-01' },
                ],
            },
        ]);

        const result = await list_pages({}, ctx);
        assert.equal(result[0].path, '/about');
        assert.equal(result[0].section, 'info');
    });

    it('e-commerce/check_order_status — should handle alternative field names', async () => {
        const ctx = createMockContext(BASE, [
            {
                path: '/api/orders/123',
                body: {
                    order_number: 'ORD-123',
                    fulfillment_status: 'delivered',
                    total_price: 99.99,
                    date_created: '2026-02-01',
                    items: [{ title: 'Widget', quantity: 1, price: 99.99 }],
                },
            },
        ]);

        const result = await check_order_status({ orderId: '123' }, ctx);
        assert.equal(result.id, 'ORD-123');
        assert.equal(result.status, 'delivered');
    });
});
