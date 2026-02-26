// ============================================================
// Nuxeo Handler Tests
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createMockContext } from './helpers.js';
import {
    nuxeo_search, nuxeo_get_document, nuxeo_browse,
    nuxeo_create_document, nuxeo_start_workflow,
} from '../nuxeo/handler.js';

const BASE = 'https://nuxeo.example.com';

// ---- Fixtures ----

const NX_DOC = {
    uid: 'abc-123',
    type: 'File',
    title: 'Quarterly Report',
    path: '/default-domain/workspaces/reports/quarterly',
    state: 'project',
    properties: {
        'dc:title': 'Quarterly Report',
        'dc:creator': 'admin',
        'dc:created': '2026-01-10T09:00:00Z',
        'dc:modified': '2026-02-20T14:00:00Z',
        'dc:contributors': ['admin', 'editor'],
        'dc:description': 'Q4 financial report',
    },
};

const NX_SEARCH_RESPONSE = {
    entries: [NX_DOC],
    totalSize: 1,
    pageSize: 10,
    currentPageIndex: 0,
    numberOfPages: 1,
};

// ---- nuxeo_search ----

describe('nuxeo/nuxeo_search', () => {
    it('should perform a full-text search', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/nuxeo/api/v1/search/lang/NXQL/execute', body: NX_SEARCH_RESPONSE },
        ]);

        const result = await nuxeo_search({ query: 'report' }, ctx);

        assert.equal(result.results.length, 1);
        assert.equal(result.results[0].uid, 'abc-123');
        assert.equal(result.results[0].title, 'Quarterly Report');
        assert.equal(result.totalSize, 1);
        // Full-text query should be auto-generated
        assert.ok(ctx.calls[0].url.includes("ecm%3Afulltext"));
    });

    it('should pass through NXQL queries directly', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/nuxeo/api/v1/search/lang/NXQL/execute', body: NX_SEARCH_RESPONSE },
        ]);

        await nuxeo_search({ query: "SELECT * FROM Document WHERE dc:title = 'test'" }, ctx);

        // NXQL query should be passed as-is, not wrapped
        assert.ok(ctx.calls[0].url.includes('SELECT'));
        assert.ok(!ctx.calls[0].url.includes('ecm%3Afulltext'));
    });

    it('should cap pageSize at 100', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/nuxeo/api/v1/search/lang/NXQL/execute', body: { ...NX_SEARCH_RESPONSE, entries: [] } },
        ]);

        await nuxeo_search({ query: 'test', pageSize: 500 }, ctx);

        assert.ok(ctx.calls[0].url.includes('pageSize=100'));
    });

    it('should include auth headers when apiKey is provided', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/nuxeo/api/v1/search/lang/NXQL/execute', body: { ...NX_SEARCH_RESPONSE, entries: [] } },
        ], { apiKey: 'my-secret-token' });

        await nuxeo_search({ query: 'test' }, ctx);

        const headers = ctx.calls[0].init.headers;
        assert.equal(headers['Authorization'], 'Bearer my-secret-token');
    });

    it('should throw on API error', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/nuxeo/api/v1/search/lang/NXQL/execute', status: 403, body: {} },
        ]);

        await assert.rejects(
            () => nuxeo_search({ query: 'fail' }, ctx),
            /Nuxeo API error: 403/
        );
    });
});

// ---- nuxeo_get_document ----

describe('nuxeo/nuxeo_get_document', () => {
    it('should fetch a document by path', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/nuxeo/api/v1/path/default-domain/workspaces/reports', body: NX_DOC },
        ]);

        const result = await nuxeo_get_document({ idOrPath: '/default-domain/workspaces/reports' }, ctx);

        assert.equal(result.uid, 'abc-123');
        assert.equal(result.type, 'File');
        assert.ok(ctx.calls[0].url.includes('/nuxeo/api/v1/path'));
    });

    it('should fetch a document by UUID', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/nuxeo/api/v1/id/abc-123', body: NX_DOC },
        ]);

        const result = await nuxeo_get_document({ idOrPath: 'abc-123' }, ctx);

        assert.equal(result.uid, 'abc-123');
        assert.ok(ctx.calls[0].url.includes('/nuxeo/api/v1/id/abc-123'));
    });

    it('should request enrichers', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/nuxeo/api/v1/id/abc-123', body: NX_DOC },
        ]);

        await nuxeo_get_document({ idOrPath: 'abc-123' }, ctx);

        assert.ok(ctx.calls[0].url.includes('enrichers.document='));
    });
});

// ---- nuxeo_browse ----

describe('nuxeo/nuxeo_browse', () => {
    it('should list children of a folder', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/nuxeo/api/v1/search/lang/NXQL/execute', body: { entries: [NX_DOC, { ...NX_DOC, uid: 'def-456', title: 'Budget' }] } },
        ]);

        const result = await nuxeo_browse({ parentPath: '/default-domain/workspaces' }, ctx);

        assert.equal(result.length, 2);
        assert.equal(result[0].uid, 'abc-123');
        assert.equal(result[1].uid, 'def-456');
    });

    it('should default to /default-domain', async () => {
        const ctx = createMockContext(BASE, [
            { path: '/nuxeo/api/v1/search/lang/NXQL/execute', body: { entries: [] } },
        ]);

        await nuxeo_browse({}, ctx);

        assert.ok(ctx.calls[0].url.includes('default-domain'));
    });
});

// ---- nuxeo_create_document ----

describe('nuxeo/nuxeo_create_document', () => {
    it('should create a document with correct payload', async () => {
        const created = { ...NX_DOC, uid: 'new-789' };
        const ctx = createMockContext(BASE, [
            { method: 'POST', path: '/nuxeo/api/v1/path/default-domain/workspaces', body: created },
        ]);

        const result = await nuxeo_create_document({
            parentPath: '/default-domain/workspaces',
            type: 'File',
            title: 'New Report',
        }, ctx);

        assert.equal(result.uid, 'new-789');
        const sentBody = JSON.parse(ctx.calls[0].init.body);
        assert.equal(sentBody['entity-type'], 'document');
        assert.equal(sentBody.type, 'File');
        assert.equal(sentBody.properties['dc:title'], 'New Report');
        assert.equal(sentBody.name, 'new-report'); // slugified
    });

    it('should merge additional properties', async () => {
        const ctx = createMockContext(BASE, [
            { method: 'POST', path: '/nuxeo/api/v1/path/default-domain', body: NX_DOC },
        ]);

        await nuxeo_create_document({
            parentPath: '/default-domain',
            type: 'Note',
            title: 'My Note',
            properties: { 'dc:description': 'A test note' },
        }, ctx);

        const sentBody = JSON.parse(ctx.calls[0].init.body);
        assert.equal(sentBody.properties['dc:description'], 'A test note');
        assert.equal(sentBody.properties['dc:title'], 'My Note');
    });

    it('should throw on API error', async () => {
        const ctx = createMockContext(BASE, [
            { method: 'POST', path: '/nuxeo/api/v1/path', status: 409, body: { message: 'Document already exists' } },
        ]);

        await assert.rejects(
            () => nuxeo_create_document({ parentPath: '/default-domain', type: 'File', title: 'Dup' }, ctx),
            /Document already exists/
        );
    });
});

// ---- nuxeo_start_workflow ----

describe('nuxeo/nuxeo_start_workflow', () => {
    it('should start a workflow on a document', async () => {
        const ctx = createMockContext(BASE, [
            {
                method: 'POST',
                path: '/nuxeo/api/v1/id/abc-123/@op/Context.StartWorkflow',
                body: { id: 'wf-001', name: 'SerialDocumentReview', state: 'running' },
            },
        ]);

        const result = await nuxeo_start_workflow({
            documentId: 'abc-123',
            workflowModelName: 'SerialDocumentReview',
        }, ctx);

        assert.equal(result.id, 'wf-001');
        assert.equal(result.name, 'SerialDocumentReview');
        assert.equal(result.state, 'running');

        const sentBody = JSON.parse(ctx.calls[0].init.body);
        assert.equal(sentBody.params.id, 'SerialDocumentReview');
    });

    it('should throw on workflow error', async () => {
        const ctx = createMockContext(BASE, [
            {
                method: 'POST',
                path: '/nuxeo/api/v1/id/abc-123/@op/Context.StartWorkflow',
                status: 500,
                body: { message: 'Workflow model not found' },
            },
        ]);

        await assert.rejects(
            () => nuxeo_start_workflow({ documentId: 'abc-123', workflowModelName: 'BadWorkflow' }, ctx),
            /Workflow model not found/
        );
    });
});
