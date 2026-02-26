// ============================================================
// WordPress Handler Tests
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMockContext } from './helpers.js';
import { search_posts, get_post, list_categories, submit_comment } from '../wordpress/handler.js';

const BASE = 'https://example.wordpress.com';

// ---- Fixtures ----

const WP_POST = {
    id: 42,
    title: { rendered: 'Hello World' },
    excerpt: { rendered: '<p>Welcome to WordPress.</p>' },
    content: { rendered: '<p>Full content here.</p>' },
    author: 1,
    date: '2026-01-15T10:00:00',
    modified: '2026-01-16T08:00:00',
    link: 'https://example.wordpress.com/hello-world',
    slug: 'hello-world',
    categories: [3],
    tags: [5, 7],
    featured_media: 99,
};

const WP_CATEGORY = {
    id: 3,
    name: 'Tech',
    slug: 'tech',
    description: 'Technology posts',
    count: 12,
    parent: 0,
};

// ---- search_posts ----

describe('wordpress/search_posts', () => {
    it('should search posts with a basic query', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/wp-json/wp/v2/posts', body: [WP_POST] },
        ]);

        const result = await search_posts({ query: 'hello' }, ctx);

        assert.equal(result.length, 1);
        assert.equal(result[0].id, 42);
        assert.equal(result[0].title, 'Hello World');
        assert.equal(result[0].slug, 'hello-world');
        assert.ok(!result[0].excerpt.includes('<p>'), 'HTML tags should be stripped from excerpt');
        // Verify correct URL was called
        assert.ok(ctx.calls[0].url.includes('search=hello'));
    });

    it('should search pages when type is "page"', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/wp-json/wp/v2/pages', body: [WP_POST] },
        ]);

        await search_posts({ query: 'about', type: 'page' }, ctx);

        assert.ok(ctx.calls[0].url.includes('/wp-json/wp/v2/pages'));
    });

    it('should respect the limit parameter', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/wp-json/wp/v2/posts', body: [] },
        ]);

        await search_posts({ query: 'test', limit: 5 }, ctx);

        assert.ok(ctx.calls[0].url.includes('per_page=5'));
    });

    it('should resolve category slug before searching', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/wp-json/wp/v2/categories', body: [WP_CATEGORY] },
            { path: '/wp-json/wp/v2/posts', body: [WP_POST] },
        ]);

        await search_posts({ query: 'hello', category: 'tech' }, ctx);

        // Should have made 2 calls: category lookup + post search
        assert.equal(ctx.calls.length, 2);
        assert.ok(ctx.calls[0].url.includes('/wp-json/wp/v2/categories'));
        assert.ok(ctx.calls[1].url.includes('categories=3'));
    });

    it('should throw on API error', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/wp-json/wp/v2/posts', status: 500, body: {} },
        ]);

        await assert.rejects(
            () => search_posts({ query: 'fail' }, ctx),
            /WordPress API error: 500/
        );
    });
});

// ---- get_post ----

describe('wordpress/get_post', () => {
    it('should fetch a post by numeric ID', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/wp-json/wp/v2/posts/42', body: WP_POST },
        ]);

        const result = await get_post({ idOrSlug: '42' }, ctx);

        assert.equal(result.id, 42);
        assert.equal(result.title, 'Hello World');
        assert.equal(result.content, '<p>Full content here.</p>');
        assert.equal(result.featuredMedia, 99);
    });

    it('should fall back to pages when post ID not found', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/wp-json/wp/v2/posts/42', status: 404, body: {} },
            { path: '/wp-json/wp/v2/pages/42', body: WP_POST },
        ]);

        const result = await get_post({ idOrSlug: '42' }, ctx);

        assert.equal(result.id, 42);
        assert.equal(ctx.calls.length, 2);
    });

    it('should fetch a post by slug', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/wp-json/wp/v2/posts', body: [WP_POST] },
        ]);

        const result = await get_post({ idOrSlug: 'hello-world' }, ctx);

        assert.equal(result.slug, 'hello-world');
        assert.ok(ctx.calls[0].url.includes('slug=hello-world'));
    });

    it('should throw when post/page not found by slug', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/wp-json/wp/v2/posts', body: [] },
            { path: '/wp-json/wp/v2/pages', body: [] },
        ]);

        await assert.rejects(
            () => get_post({ idOrSlug: 'nonexistent' }, ctx),
            /not found/
        );
    });
});

// ---- list_categories ----

describe('wordpress/list_categories', () => {
    it('should list all categories', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/wp-json/wp/v2/categories', body: [WP_CATEGORY, { ...WP_CATEGORY, id: 5, name: 'News', slug: 'news', count: 8, parent: 0 }] },
        ]);

        const result = await list_categories({}, ctx);

        assert.equal(result.length, 2);
        assert.equal(result[0].name, 'Tech');
        assert.equal(result[0].count, 12);
        assert.equal(result[1].name, 'News');
    });

    it('should request up to 100 categories', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/wp-json/wp/v2/categories', body: [] },
        ]);

        await list_categories({}, ctx);

        assert.ok(ctx.calls[0].url.includes('per_page=100'));
    });
});

// ---- submit_comment ----

describe('wordpress/submit_comment', () => {
    it('should submit a comment successfully', async () => {
        const ctx = createMockContext(BASE, [
            {
                method: 'POST',
                path: '/wp-json/wp/v2/comments',
                body: { id: 101, status: 'hold', date: '2026-02-26T12:00:00' },
            },
        ]);

        const result = await submit_comment({
            postId: '42',
            author: 'Test User',
            content: 'Great post!',
            email: 'test@example.com',
        }, ctx);

        assert.equal(result.id, 101);
        assert.equal(result.status, 'hold');
        // Verify POST body
        const sentBody = JSON.parse(ctx.calls[0].init.body);
        assert.equal(sentBody.post, 42);
        assert.equal(sentBody.author_name, 'Test User');
        assert.equal(sentBody.content, 'Great post!');
        assert.equal(sentBody.author_email, 'test@example.com');
    });

    it('should submit without email', async () => {
        const ctx = createMockContext(BASE, [
            {
                method: 'POST',
                path: '/wp-json/wp/v2/comments',
                body: { id: 102, status: 'approved', date: '2026-02-26T12:00:00' },
            },
        ]);

        const result = await submit_comment({
            postId: '42',
            author: 'Anonymous',
            content: 'No email here',
        }, ctx);

        assert.equal(result.id, 102);
        const sentBody = JSON.parse(ctx.calls[0].init.body);
        assert.equal(sentBody.author_email, undefined);
    });

    it('should throw on API error with message', async () => {
        const ctx = createMockContext(BASE, [
            {
                method: 'POST',
                path: '/wp-json/wp/v2/comments',
                status: 403,
                body: { message: 'Comments are closed' },
            },
        ]);

        await assert.rejects(
            () => submit_comment({ postId: '42', author: 'X', content: 'Y' }, ctx),
            /Comments are closed/
        );
    });
});
