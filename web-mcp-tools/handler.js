// ============================================================
// WebMCP Platform — Tool Handlers
// All data fetched from the WebMCP API (no hardcoded data)
// ============================================================

const API_BASE = 'https://api.web-mcp.tools';

/**
 * Get WebMCP pricing plans.
 * @param {object} input
 * @param {string} [input.plan] - Optional specific plan ID
 * @param {object} context
 */
export async function get_pricing(input, context) {
    const { fetch: fetchFn } = context || {};
    const doFetch = fetchFn || fetch;

    const url = new URL('/api/v1/platform/pricing', API_BASE);
    if (input.plan) url.searchParams.set('plan', input.plan);

    const res = await doFetch(url.toString());
    if (!res.ok) throw new Error(`Pricing API error: ${res.status}`);

    const { data } = await res.json();
    return data;
}

/**
 * Search WebMCP documentation.
 * @param {object} input
 * @param {string} input.query - Search query
 * @param {number} [input.limit=5] - Max results
 * @param {object} context
 */
export async function search_docs(input, context) {
    const { fetch: fetchFn } = context || {};
    const doFetch = fetchFn || fetch;

    const url = new URL('/api/v1/platform/docs', API_BASE);
    url.searchParams.set('q', input.query);
    if (input.limit) url.searchParams.set('limit', String(input.limit));

    const res = await doFetch(url.toString());
    if (!res.ok) throw new Error(`Docs API error: ${res.status}`);

    const { data, total } = await res.json();
    return { results: data, total, query: input.query };
}

/**
 * Browse the open-source tool catalog.
 * @param {object} input
 * @param {string} [input.category] - Optional category filter
 * @param {object} context
 */
export async function list_catalog_tools(input, context) {
    const { fetch: fetchFn } = context || {};
    const doFetch = fetchFn || fetch;

    const res = await doFetch(`${API_BASE}/api/v1/tools/catalog`);
    if (!res.ok) throw new Error(`Catalog API error: ${res.status}`);

    const { data } = await res.json();
    let entries = data || [];

    if (input.category) {
        entries = entries.filter(
            (e) => e.category.toLowerCase() === input.category.toLowerCase()
        );
    }

    return {
        entries: entries.map((e) => ({
            id: e.id,
            name: e.name,
            description: e.description,
            category: e.category,
            toolCount: e.toolCount,
            version: e.version,
        })),
        total: entries.length,
    };
}

/**
 * Generate the SDK embed snippet for a site.
 * @param {object} input
 * @param {string} input.site_id - Site UUID
 * @param {object} [input.options] - Options (async, defer)
 */
export async function get_sdk_snippet(input) {
    const siteId = input.site_id;
    if (!siteId || siteId.length < 10) {
        return { error: 'Invalid site_id. Provide your site UUID from the dashboard.' };
    }

    const attrs = [];
    if (input.options?.async !== false) attrs.push('async');
    if (input.options?.defer) attrs.push('defer');

    const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
    const snippet = `<script src="https://sdk.web-mcp.tools/${siteId}/sdk.js"${attrStr}></script>`;

    return {
        snippet,
        instructions: [
            'Paste this snippet into the <head> or before </body> of your HTML.',
            'The SDK (2KB gzipped) loads asynchronously and registers your tools on navigator.modelContext.',
            'No configuration needed — tool definitions are baked into the bundle.',
        ],
        cdnUrl: `https://sdk.web-mcp.tools/${siteId}/sdk.js`,
    };
}

/**
 * Check if the current browser supports WebMCP.
 */
export async function check_webmcp_support() {
    const hasModelContext =
        typeof navigator !== 'undefined' && 'modelContext' in navigator;
    const hasRegisterTool =
        hasModelContext &&
        typeof navigator.modelContext?.registerTool === 'function';

    return {
        supported: hasModelContext,
        features: {
            'navigator.modelContext': hasModelContext,
            'modelContext.registerTool': hasRegisterTool,
        },
        recommendation: hasModelContext
            ? 'Your browser supports WebMCP! Tools registered via the SDK will be available to AI agents.'
            : 'Your browser does not yet support WebMCP (navigator.modelContext). The SDK will work in polyfill mode.',
    };
}

/**
 * Estimate which plan fits based on usage.
 * @param {object} input
 * @param {number} input.tool_count - Number of tools
 * @param {number} input.monthly_page_views - Expected monthly page views
 * @param {number} [input.sites=1] - Number of sites
 * @param {object} context
 */
export async function estimate_usage(input, context) {
    const { fetch: fetchFn } = context || {};
    const doFetch = fetchFn || fetch;

    // Fetch current plans from API
    const res = await doFetch(`${API_BASE}/api/v1/platform/pricing`);
    if (!res.ok) throw new Error(`Pricing API error: ${res.status}`);
    const { data: plans } = await res.json();

    const { tool_count, monthly_page_views, sites = 1 } = input;
    const estimatedEvents = monthly_page_views * 2;

    let recommended;
    if (sites <= 1 && tool_count <= 30 && estimatedEvents <= 10000) {
        recommended = plans[0];
    } else if (sites <= 10 && tool_count <= 100 && estimatedEvents <= 500000) {
        recommended = plans[1];
    } else {
        recommended = plans[2];
    }

    return {
        recommendation: recommended.id,
        plan: recommended,
        usage: { sites, toolCount: tool_count, estimatedMonthlyEvents: estimatedEvents, monthlyPageViews: monthly_page_views },
        reasoning:
            recommended.id === 'free'
                ? 'Your usage fits comfortably within the free tier.'
                : recommended.id === 'pro'
                    ? `With ${sites} site(s), ${tool_count} tools, and ~${estimatedEvents.toLocaleString()} estimated events/month, the Pro plan is the best fit.`
                    : `With ${sites} site(s), ${tool_count} tools, and ~${estimatedEvents.toLocaleString()} estimated events/month, you need an Enterprise plan. Contact us for custom pricing.`,
    };
}

/**
 * Get recent changelog entries.
 * @param {object} input
 * @param {number} [input.limit=5] - Number of entries
 * @param {object} context
 */
export async function get_changelog(input, context) {
    const { fetch: fetchFn } = context || {};
    const doFetch = fetchFn || fetch;

    const url = new URL('/api/v1/platform/changelog', API_BASE);
    if (input.limit) url.searchParams.set('limit', String(input.limit));

    const res = await doFetch(url.toString());
    if (!res.ok) throw new Error(`Changelog API error: ${res.status}`);

    const { data, total } = await res.json();
    return { entries: data, total };
}

/**
 * Get current platform status.
 * @param {object} _input
 * @param {object} context
 */
export async function get_platform_status(_input, context) {
    const { fetch: fetchFn } = context || {};
    const doFetch = fetchFn || fetch;

    try {
        const res = await doFetch(`${API_BASE}/api/v1/platform/status`);
        const { data } = await res.json();
        return data;
    } catch {
        return {
            api: { status: 'degraded', error: 'Health check failed' },
            sdk_cdn: { status: 'unknown' },
            dashboard: { status: 'unknown' },
            incidents: [{
                severity: 'warning',
                message: 'API is not responding. The service may be experiencing issues.',
                timestamp: new Date().toISOString(),
            }],
        };
    }
}
