// ============================================================
// E-Commerce — Tool Handlers
// Generic e-commerce API integration (REST / JSON)
// ============================================================

/**
 * Search the product catalog by keyword, category, or filters.
 * @param {object} input
 * @param {string} input.query - Search query
 * @param {string} [input.category] - Filter by category name
 * @param {number} [input.minPrice] - Minimum price filter
 * @param {number} [input.maxPrice] - Maximum price filter
 * @param {number} [input.limit=10] - Number of results
 * @param {object} context
 * @param {string} context.baseUrl - Store API base URL
 * @param {function} context.fetch - Fetch function
 */
export async function search_products(input, context) {
    const { baseUrl, fetch } = context;
    const url = new URL('/api/products/search', baseUrl);

    url.searchParams.set('q', input.query);
    if (input.category) url.searchParams.set('category', input.category);
    if (input.minPrice != null) url.searchParams.set('min_price', String(input.minPrice));
    if (input.maxPrice != null) url.searchParams.set('max_price', String(input.maxPrice));
    url.searchParams.set('limit', String(input.limit || 10));

    const res = await fetch(url.toString(), {
        headers: buildHeaders(context),
    });
    if (!res.ok) throw new Error(`Store API error: ${res.status} ${res.statusText}`);

    const data = await res.json();
    return (data.products || data.results || data).map((p) => ({
        id: p.id,
        name: p.name || p.title,
        price: p.price,
        currency: p.currency || 'USD',
        image: p.image || p.images?.[0],
        inStock: p.in_stock ?? p.available ?? true,
        category: p.category,
        url: p.url || p.permalink,
    }));
}

/**
 * Get full details for a specific product.
 * @param {object} input
 * @param {string} input.productId - Product ID or slug
 * @param {object} context
 */
export async function get_product(input, context) {
    const { baseUrl, fetch } = context;
    const url = new URL(`/api/products/${input.productId}`, baseUrl);

    const res = await fetch(url.toString(), {
        headers: buildHeaders(context),
    });
    if (!res.ok) throw new Error(`Product not found: ${res.status}`);

    const p = await res.json();
    return {
        id: p.id,
        name: p.name || p.title,
        description: p.description,
        price: p.price,
        compareAtPrice: p.compare_at_price || p.regular_price,
        currency: p.currency || 'USD',
        images: p.images || [],
        variants: (p.variants || []).map((v) => ({
            id: v.id,
            name: v.name || v.title,
            price: v.price,
            inStock: v.in_stock ?? v.available ?? true,
            attributes: v.attributes || {},
        })),
        inStock: p.in_stock ?? p.available ?? true,
        category: p.category,
        tags: p.tags || [],
        reviews: p.reviews_count || p.rating_count || 0,
        rating: p.average_rating || p.rating || null,
    };
}

/**
 * Add a product to the shopping cart.
 * @param {object} input
 * @param {string} input.productId - Product ID to add
 * @param {string} [input.variantId] - Variant ID
 * @param {number} [input.quantity=1] - Quantity to add
 * @param {object} context
 */
export async function add_to_cart(input, context) {
    const { baseUrl, fetch } = context;
    const url = new URL('/api/cart/items', baseUrl);

    const body = {
        product_id: input.productId,
        quantity: input.quantity || 1,
    };
    if (input.variantId) body.variant_id = input.variantId;

    const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
            ...buildHeaders(context),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed to add to cart: ${res.status}`);
    }

    const cart = await res.json();
    return {
        itemCount: cart.item_count || cart.items?.length,
        total: cart.total || cart.total_price,
        currency: cart.currency || 'USD',
    };
}

/**
 * View the current shopping cart contents.
 * @param {object} _input
 * @param {object} context
 */
export async function get_cart(_input, context) {
    const { baseUrl, fetch } = context;
    const url = new URL('/api/cart', baseUrl);

    const res = await fetch(url.toString(), {
        headers: buildHeaders(context),
    });
    if (!res.ok) throw new Error(`Failed to fetch cart: ${res.status}`);

    const cart = await res.json();
    return {
        items: (cart.items || []).map((item) => ({
            productId: item.product_id || item.id,
            name: item.name || item.title,
            quantity: item.quantity,
            price: item.price,
            total: item.line_total || item.price * item.quantity,
        })),
        subtotal: cart.subtotal || cart.total_price,
        total: cart.total || cart.total_price,
        currency: cart.currency || 'USD',
        itemCount: cart.item_count || cart.items?.length || 0,
    };
}

/**
 * Check the status of an existing order.
 * @param {object} input
 * @param {string} input.orderId - Order ID or confirmation number
 * @param {object} context
 */
export async function check_order_status(input, context) {
    const { baseUrl, fetch } = context;
    const url = new URL(`/api/orders/${input.orderId}`, baseUrl);

    const res = await fetch(url.toString(), {
        headers: buildHeaders(context),
    });
    if (!res.ok) throw new Error(`Order not found: ${res.status}`);

    const order = await res.json();
    return {
        id: order.id || order.order_number,
        status: order.status || order.fulfillment_status,
        total: order.total || order.total_price,
        currency: order.currency || 'USD',
        createdAt: order.created_at || order.date_created,
        shipping: order.shipping ? {
            status: order.shipping.status,
            carrier: order.shipping.carrier,
            trackingNumber: order.shipping.tracking_number,
            trackingUrl: order.shipping.tracking_url,
            estimatedDelivery: order.shipping.estimated_delivery,
        } : null,
        items: (order.line_items || order.items || []).map((item) => ({
            name: item.name || item.title,
            quantity: item.quantity,
            price: item.price,
        })),
    };
}

// ---- Internal helpers ----

function buildHeaders(context) {
    const headers = {};
    if (context.apiKey) {
        headers['Authorization'] = `Bearer ${context.apiKey}`;
    }
    return headers;
}
