// ============================================================
// Generic Website — Tool Handlers
// Fetch-based tools for any website
// ============================================================

/**
 * Search the website content.
 * @param {object} input
 * @param {string} input.query - Search query
 * @param {number} [input.limit=10] - Maximum number of results
 * @param {object} context
 * @param {string} context.baseUrl - Website base URL
 * @param {function} context.fetch - Fetch function
 */
export async function search(input, context) {
    const { baseUrl, fetch } = context;
    const url = new URL('/api/search', baseUrl);
    url.searchParams.set('q', input.query);
    url.searchParams.set('limit', String(input.limit || 10));

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Search API error: ${res.status}`);

    const data = await res.json();
    return (data.results || data).map((r) => ({
        title: r.title,
        url: r.url || r.path,
        excerpt: r.excerpt || r.snippet || r.description,
        score: r.score,
    }));
}

/**
 * Get structured information about a specific page.
 * @param {object} input
 * @param {string} input.path - Page path relative to the site root
 * @param {object} context
 */
export async function get_page_info(input, context) {
    const { baseUrl, fetch } = context;
    const pagePath = input.path.startsWith('/') ? input.path : `/${input.path}`;

    const res = await fetch(new URL(pagePath, baseUrl).toString());
    if (!res.ok) throw new Error(`Page not found: ${res.status}`);

    const html = await res.text();

    // Extract basic info from HTML
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '';
    const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || '';
    const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim() || '';

    // Extract headings
    const headings = [];
    const headingRegex = /<(h[1-6])[^>]*>(.*?)<\/\1>/gi;
    let match;
    while ((match = headingRegex.exec(html)) !== null) {
        headings.push({
            level: parseInt(match[1][1]),
            text: match[2].replace(/<[^>]+>/g, '').trim(),
        });
    }

    return {
        title: title || h1,
        description: metaDesc,
        headings: headings.slice(0, 20),
        url: new URL(pagePath, baseUrl).toString(),
    };
}

/**
 * Submit a form on the website.
 * @param {object} input
 * @param {string} input.formId - Identifier of the form (e.g. 'contact', 'newsletter')
 * @param {object} input.fields - Key-value pairs of form fields
 * @param {object} context
 */
export async function submit_form(input, context) {
    const { baseUrl, fetch } = context;
    const url = new URL(`/api/forms/${input.formId}`, baseUrl);

    const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.fields),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Form submission failed: ${res.status}`);
    }

    const data = await res.json();
    return {
        success: true,
        message: data.message || 'Form submitted successfully',
        id: data.id || data.submission_id,
    };
}

/**
 * List all available pages and their descriptions.
 * @param {object} input
 * @param {string} [input.section] - Optional section filter
 * @param {object} context
 */
export async function list_pages(input, context) {
    const { baseUrl, fetch } = context;
    const url = new URL('/api/pages', baseUrl);
    if (input.section) url.searchParams.set('section', input.section);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Pages API error: ${res.status}`);

    const data = await res.json();
    return (data.pages || data).map((p) => ({
        title: p.title,
        path: p.path || p.url,
        description: p.description,
        section: p.section || p.category,
        lastModified: p.last_modified || p.updated_at,
    }));
}
