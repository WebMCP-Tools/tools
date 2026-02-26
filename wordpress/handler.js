// ============================================================
// WordPress — Tool Handlers
// Interacts with the WordPress REST API (v2)
// ============================================================

/**
 * Search blog posts and pages by keyword.
 * @param {object} input
 * @param {string} input.query - Search query
 * @param {string} [input.type='any'] - Content type: 'post', 'page', or 'any'
 * @param {string} [input.category] - Filter by category slug
 * @param {number} [input.limit=10] - Number of results
 * @param {object} context
 * @param {string} context.baseUrl - WordPress site URL
 * @param {function} context.fetch - Fetch function
 */
export async function search_posts(input, context) {
    const { baseUrl, fetch } = context;
    const type = input.type || 'any';
    const limit = input.limit || 10;

    const endpoint = type === 'page' ? '/wp-json/wp/v2/pages' : '/wp-json/wp/v2/posts';
    const url = new URL(endpoint, baseUrl);
    url.searchParams.set('search', input.query);
    url.searchParams.set('per_page', String(limit));

    if (input.category) {
        // Resolve category slug → ID first
        const catUrl = new URL('/wp-json/wp/v2/categories', baseUrl);
        catUrl.searchParams.set('slug', input.category);
        const catRes = await fetch(catUrl.toString());
        if (catRes.ok) {
            const cats = await catRes.json();
            if (cats.length > 0) {
                url.searchParams.set('categories', String(cats[0].id));
            }
        }
    }

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`WordPress API error: ${res.status} ${res.statusText}`);

    const posts = await res.json();
    return posts.map((p) => ({
        id: p.id,
        title: p.title?.rendered,
        excerpt: p.excerpt?.rendered?.replace(/<[^>]+>/g, '').trim(),
        author: p.author,
        date: p.date,
        link: p.link,
        slug: p.slug,
        categories: p.categories,
    }));
}

/**
 * Get the full content of a post or page by ID or slug.
 * @param {object} input
 * @param {string} input.idOrSlug - Post/page ID or URL slug
 * @param {object} context
 */
export async function get_post(input, context) {
    const { baseUrl, fetch } = context;
    const { idOrSlug } = input;

    // Try by ID first, then by slug
    const isNumeric = /^\d+$/.test(idOrSlug);

    if (isNumeric) {
        const url = new URL(`/wp-json/wp/v2/posts/${idOrSlug}`, baseUrl);
        const res = await fetch(url.toString());
        if (res.ok) return formatPost(await res.json());

        // Try pages
        const pageUrl = new URL(`/wp-json/wp/v2/pages/${idOrSlug}`, baseUrl);
        const pageRes = await fetch(pageUrl.toString());
        if (pageRes.ok) return formatPost(await pageRes.json());

        throw new Error(`Post/page with ID ${idOrSlug} not found`);
    }

    // Search by slug
    const url = new URL('/wp-json/wp/v2/posts', baseUrl);
    url.searchParams.set('slug', idOrSlug);
    const res = await fetch(url.toString());
    if (res.ok) {
        const posts = await res.json();
        if (posts.length > 0) return formatPost(posts[0]);
    }

    // Try pages
    const pageUrl = new URL('/wp-json/wp/v2/pages', baseUrl);
    pageUrl.searchParams.set('slug', idOrSlug);
    const pageRes = await fetch(pageUrl.toString());
    if (pageRes.ok) {
        const pages = await pageRes.json();
        if (pages.length > 0) return formatPost(pages[0]);
    }

    throw new Error(`Post/page with slug "${idOrSlug}" not found`);
}

/**
 * List all categories with post counts.
 * @param {object} _input
 * @param {object} context
 */
export async function list_categories(_input, context) {
    const { baseUrl, fetch } = context;
    const url = new URL('/wp-json/wp/v2/categories', baseUrl);
    url.searchParams.set('per_page', '100');

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`WordPress API error: ${res.status}`);

    const categories = await res.json();
    return categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        count: c.count,
        parent: c.parent || null,
    }));
}

/**
 * Submit a comment on a blog post.
 * @param {object} input
 * @param {string} input.postId - ID of the post to comment on
 * @param {string} input.author - Comment author name
 * @param {string} [input.email] - Comment author email
 * @param {string} input.content - Comment text
 * @param {object} context
 */
export async function submit_comment(input, context) {
    const { baseUrl, fetch } = context;
    const url = new URL('/wp-json/wp/v2/comments', baseUrl);

    const body = {
        post: Number(input.postId),
        author_name: input.author,
        content: input.content,
    };
    if (input.email) body.author_email = input.email;

    const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed to submit comment: ${res.status}`);
    }

    const comment = await res.json();
    return {
        id: comment.id,
        status: comment.status,
        date: comment.date,
    };
}

// ---- Internal helpers ----

function formatPost(p) {
    return {
        id: p.id,
        title: p.title?.rendered,
        content: p.content?.rendered,
        excerpt: p.excerpt?.rendered?.replace(/<[^>]+>/g, '').trim(),
        author: p.author,
        date: p.date,
        modified: p.modified,
        link: p.link,
        slug: p.slug,
        featuredMedia: p.featured_media || null,
        categories: p.categories,
        tags: p.tags,
    };
}
