// ============================================================
// E-Commerce Handler Tests
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMockContext } from './helpers.js';
import {
    search_products, get_product, add_to_cart,
    get_cart, check_order_status,
} from '../e-commerce/handler.js';

const BASE = 'https://store.example.com';

// ---- Fixtures ----

const PRODUCT = {
    id: 'prod-1',
    name: 'Blue Running Shoes',
    price: 89.99,
    currency: 'USD',
    image: 'https://cdn.example.com/shoes.jpg',
    in_stock: true,
    category: 'Shoes',
    url: '/products/blue-running-shoes',
};

const PRODUCT_DETAIL = {
    ...PRODUCT,
    description: 'Lightweight running shoes in ocean blue.',
    images: ['shoes-1.jpg', 'shoes-2.jpg'],
    variants: [
        { id: 'var-1', name: 'Size 10', price: 89.99, in_stock: true, attributes: { size: '10' } },
        { id: 'var-2', name: 'Size 11', price: 89.99, in_stock: false, attributes: { size: '11' } },
    ],
    tags: ['running', 'sneakers'],
    reviews_count: 42,
    average_rating: 4.5,
};

// ---- search_products ----

describe('e-commerce/search_products', () => {
    it('should search products by query', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/api/products/search', body: { products: [PRODUCT] } },
        ]);

        const result = await search_products({ query: 'running shoes' }, ctx);

        assert.equal(result.length, 1);
        assert.equal(result[0].id, 'prod-1');
        assert.equal(result[0].name, 'Blue Running Shoes');
        assert.equal(result[0].price, 89.99);
        assert.equal(result[0].inStock, true);
        assert.ok(ctx.calls[0].url.includes('q=running+shoes'));
    });

    it('should pass all filter params', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/api/products/search', body: { products: [] } },
        ]);

        await search_products({
            query: 'shoes',
            category: 'Sneakers',
            minPrice: 50,
            maxPrice: 150,
            limit: 5,
        }, ctx);

        const url = ctx.calls[0].url;
        assert.ok(url.includes('category=Sneakers'));
        assert.ok(url.includes('min_price=50'));
        assert.ok(url.includes('max_price=150'));
        assert.ok(url.includes('limit=5'));
    });

    it('should handle alternative response shapes', async () => {
        // Some APIs return { results: [...] } instead of { products: [...] }
        const ctx = createMockContext(BASE, [
            { path: '/api/products/search', body: { results: [PRODUCT] } },
        ]);

        const result = await search_products({ query: 'shoes' }, ctx);
        assert.equal(result.length, 1);
    });

    it('should include auth header when apiKey provided', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/api/products/search', body: { products: [] } },
        ], { apiKey: 'store-key-123' });

        await search_products({ query: 'test' }, ctx);

        const headers = ctx.calls[0].init.headers;
        assert.equal(headers['Authorization'], 'Bearer store-key-123');
    });
});

// ---- get_product ----

describe('e-commerce/get_product', () => {
    it('should fetch full product details', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/api/products/prod-1', body: PRODUCT_DETAIL },
        ]);

        const result = await get_product({ productId: 'prod-1' }, ctx);

        assert.equal(result.id, 'prod-1');
        assert.equal(result.description, 'Lightweight running shoes in ocean blue.');
        assert.equal(result.variants.length, 2);
        assert.equal(result.variants[0].name, 'Size 10');
        assert.equal(result.variants[1].inStock, false);
        assert.equal(result.reviews, 42);
        assert.equal(result.rating, 4.5);
    });

    it('should throw when product not found', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/api/products/nope', status: 404, body: {} },
        ]);

        await assert.rejects(
            () => get_product({ productId: 'nope' }, ctx),
            /Product not found: 404/
        );
    });
});

// ---- add_to_cart ----

describe('e-commerce/add_to_cart', () => {
    it('should add a product to cart', async () => {
        const ctx = createMockContext(BASE, [
            {
                method: 'POST',
                path: '/api/cart/items',
                body: { item_count: 3, total: 269.97, currency: 'USD' },
            },
        ]);

        const result = await add_to_cart({ productId: 'prod-1', quantity: 3 }, ctx);

        assert.equal(result.itemCount, 3);
        assert.equal(result.total, 269.97);
        const sentBody = JSON.parse(ctx.calls[0].init.body);
        assert.equal(sentBody.product_id, 'prod-1');
        assert.equal(sentBody.quantity, 3);
    });

    it('should include variant ID when provided', async () => {
        const ctx = createMockContext(BASE, [
            { method: 'POST', path: '/api/cart/items', body: { item_count: 1, total: 89.99 } },
        ]);

        await add_to_cart({ productId: 'prod-1', variantId: 'var-1' }, ctx);

        const sentBody = JSON.parse(ctx.calls[0].init.body);
        assert.equal(sentBody.variant_id, 'var-1');
    });

    it('should default quantity to 1', async () => {
        const ctx = createMockContext(BASE, [
            { method: 'POST', path: '/api/cart/items', body: { item_count: 1, total: 89.99 } },
        ]);

        await add_to_cart({ productId: 'prod-1' }, ctx);

        const sentBody = JSON.parse(ctx.calls[0].init.body);
        assert.equal(sentBody.quantity, 1);
    });
});

// ---- get_cart ----

describe('e-commerce/get_cart', () => {
    it('should return formatted cart contents', async () => {
        const ctx = createMockContext(BASE, [
            {
                path: '/api/cart',
                body: {
                    items: [
                        { product_id: 'prod-1', name: 'Blue Shoes', quantity: 2, price: 89.99, line_total: 179.98 },
                    ],
                    subtotal: 179.98,
                    total: 179.98,
                    currency: 'EUR',
                    item_count: 2,
                },
            },
        ]);

        const result = await get_cart({}, ctx);

        assert.equal(result.items.length, 1);
        assert.equal(result.items[0].productId, 'prod-1');
        assert.equal(result.items[0].total, 179.98);
        assert.equal(result.total, 179.98);
        assert.equal(result.currency, 'EUR');
        assert.equal(result.itemCount, 2);
    });

    it('should handle empty cart', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/api/cart', body: { items: [], total: 0, item_count: 0 } },
        ]);

        const result = await get_cart({}, ctx);

        assert.equal(result.items.length, 0);
        assert.equal(result.itemCount, 0);
    });
});

// ---- check_order_status ----

describe('e-commerce/check_order_status', () => {
    it('should return order status with shipping info', async () => {
        const ctx = createMockContext(BASE, [
            {
                path: '/api/orders/ORD-123',
                body: {
                    id: 'ORD-123',
                    status: 'shipped',
                    total: 179.98,
                    currency: 'USD',
                    created_at: '2026-02-20T10:00:00Z',
                    shipping: {
                        status: 'in_transit',
                        carrier: 'FedEx',
                        tracking_number: 'FX12345',
                        tracking_url: 'https://fedex.com/track/FX12345',
                        estimated_delivery: '2026-02-28',
                    },
                    line_items: [
                        { name: 'Blue Shoes', quantity: 2, price: 89.99 },
                    ],
                },
            },
        ]);

        const result = await check_order_status({ orderId: 'ORD-123' }, ctx);

        assert.equal(result.id, 'ORD-123');
        assert.equal(result.status, 'shipped');
        assert.equal(result.shipping.carrier, 'FedEx');
        assert.equal(result.shipping.trackingNumber, 'FX12345');
        assert.equal(result.items.length, 1);
    });

    it('should handle order without shipping', async () => {
        const ctx = createMockContext(BASE, [
            {
                path: '/api/orders/ORD-456',
                body: { id: 'ORD-456', status: 'processing', total: 50, line_items: [] },
            },
        ]);

        const result = await check_order_status({ orderId: 'ORD-456' }, ctx);

        assert.equal(result.shipping, null);
        assert.equal(result.status, 'processing');
    });

    it('should throw when order not found', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/api/orders/NOPE', status: 404, body: {} },
        ]);

        await assert.rejects(
            () => check_order_status({ orderId: 'NOPE' }, ctx),
            /Order not found: 404/
        );
    });
});
