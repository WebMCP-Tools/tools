// ============================================================
// Generic Website Handler Tests
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMockContext } from './helpers.js';
import { search, get_page_info, submit_form, list_pages } from '../generic-website/handler.js';

const BASE = 'https://www.example.com';

// ---- search ----

describe('generic-website/search', () => {
    it('should search and map results', async () => {
        const ctx = createMockContext(BASE, [
            {
                path: '/api/search',
                body: {
                    results: [
                        { title: 'About Us', url: '/about', excerpt: 'Learn about our company', score: 0.95 },
                        { title: 'Contact', path: '/contact', snippet: 'Get in touch', score: 0.72 },
                    ],
                },
            },
        ]);

        const result = await search({ query: 'company' }, ctx);

        assert.equal(result.length, 2);
        assert.equal(result[0].title, 'About Us');
        assert.equal(result[0].url, '/about');
        assert.equal(result[0].excerpt, 'Learn about our company');
        // Should handle alternative field names
        assert.equal(result[1].url, '/contact');
        assert.equal(result[1].excerpt, 'Get in touch');
    });

    it('should pass limit parameter', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/api/search', body: { results: [] } },
        ]);

        await search({ query: 'test', limit: 5 }, ctx);

        assert.ok(ctx.calls[0].url.includes('limit=5'));
    });

    it('should throw on API error', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/api/search', status: 500, body: {} },
        ]);

        await assert.rejects(
            () => search({ query: 'fail' }, ctx),
            /Search API error: 500/
        );
    });
});

// ---- get_page_info ----

describe('generic-website/get_page_info', () => {
    it('should extract page info from HTML', async () => {
        const html = `<!DOCTYPE html>
<html>
<head>
    <title>About Our Company</title>
    <meta name="description" content="We build great software.">
</head>
<body>
    <h1>About Us</h1>
    <h2>Our Mission</h2>
    <p>We build great things.</p>
    <h2>Our Team</h2>
    <h3>Engineering</h3>
</body>
</html>`;

        const ctx = createMockContext(BASE, [
            { path: '/about', body: null, text: html },
        ]);

        const result = await get_page_info({ path: '/about' }, ctx);

        assert.equal(result.title, 'About Our Company');
        assert.equal(result.description, 'We build great software.');
        assert.ok(result.headings.length >= 3);
        assert.equal(result.headings[0].level, 1);
        assert.equal(result.headings[0].text, 'About Us');
        assert.equal(result.headings[1].level, 2);
        assert.equal(result.headings[1].text, 'Our Mission');
        assert.equal(result.url, 'https://www.example.com/about');
    });

    it('should prepend / to paths without leading slash', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/products', body: null, text: '<html><head><title>Products</title></head><body></body></html>' },
        ]);

        const result = await get_page_info({ path: 'products' }, ctx);

        assert.equal(result.title, 'Products');
    });

    it('should throw when page not found', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/nonexistent', status: 404, body: {} },
        ]);

        await assert.rejects(
            () => get_page_info({ path: '/nonexistent' }, ctx),
            /Page not found: 404/
        );
    });
});

// ---- submit_form ----

describe('generic-website/submit_form', () => {
    it('should submit a form and return confirmation', async () => {
        const ctx = createMockContext(BASE, [
            {
                method: 'POST',
                path: '/api/forms/contact',
                body: { message: 'Thanks for reaching out!', id: 'sub-789' },
            },
        ]);

        const result = await submit_form({
            formId: 'contact',
            fields: { name: 'Alice', email: 'alice@example.com', message: 'Hello!' },
        }, ctx);

        assert.equal(result.success, true);
        assert.equal(result.message, 'Thanks for reaching out!');
        assert.equal(result.id, 'sub-789');

        // Verify the submitted body
        const sentBody = JSON.parse(ctx.calls[0].init.body);
        assert.equal(sentBody.name, 'Alice');
        assert.equal(sentBody.email, 'alice@example.com');
    });

    it('should throw on server error with message', async () => {
        const ctx = createMockContext(BASE, [
            {
                method: 'POST',
                path: '/api/forms/newsletter',
                status: 422,
                body: { message: 'Invalid email address' },
            },
        ]);

        await assert.rejects(
            () => submit_form({ formId: 'newsletter', fields: { email: 'bad' } }, ctx),
            /Invalid email address/
        );
    });
});

// ---- list_pages ----

describe('generic-website/list_pages', () => {
    it('should list all pages', async () => {
        const ctx = createMockContext(BASE, [
            {
                path: '/api/pages',
                body: {
                    pages: [
                        { title: 'Home', path: '/', description: 'Welcome', section: 'main', last_modified: '2026-02-01' },
                        { title: 'Blog', url: '/blog', description: 'Latest news', category: 'content', updated_at: '2026-02-20' },
                    ],
                },
            },
        ]);

        const result = await list_pages({}, ctx);

        assert.equal(result.length, 2);
        assert.equal(result[0].title, 'Home');
        assert.equal(result[0].path, '/');
        assert.equal(result[0].section, 'main');
        // Should handle alternative field names
        assert.equal(result[1].path, '/blog');
        assert.equal(result[1].section, 'content');
    });

    it('should pass section filter', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/api/pages', body: { pages: [] } },
        ]);

        await list_pages({ section: 'blog' }, ctx);

        assert.ok(ctx.calls[0].url.includes('section=blog'));
    });

    it('should throw on API error', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/api/pages', status: 503, body: {} },
        ]);

        await assert.rejects(
            () => list_pages({}, ctx),
            /Pages API error: 503/
        );
    });
});
