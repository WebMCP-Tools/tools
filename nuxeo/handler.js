// ============================================================
// Nuxeo — Tool Handlers
// Interacts with the Nuxeo REST API
// ============================================================

/**
 * Search for documents in the Nuxeo repository.
 * @param {object} input
 * @param {string} input.query - Full-text search query or NXQL expression
 * @param {number} [input.pageSize=10] - Number of results (max 100)
 * @param {number} [input.currentPageIndex=0] - Zero-based page index
 * @param {object} context
 * @param {string} context.baseUrl - Nuxeo server URL
 * @param {string} [context.apiKey] - Authentication token
 * @param {function} context.fetch - Fetch function
 */
export async function nuxeo_search(input, context) {
    const { baseUrl, fetch } = context;
    const pageSize = Math.min(input.pageSize || 10, 100);
    const pageIndex = input.currentPageIndex || 0;

    // Detect if the query is NXQL or full-text
    const isNXQL = input.query.trim().toUpperCase().startsWith('SELECT');

    const url = new URL('/nuxeo/api/v1/search/lang/NXQL/execute', baseUrl);
    const query = isNXQL
        ? input.query
        : `SELECT * FROM Document WHERE ecm:fulltext = '${input.query.replace(/'/g, "\\'")}'
           AND ecm:mixinType != 'HiddenInNavigation'
           AND ecm:isVersion = 0
           AND ecm:isTrashed = 0`;

    url.searchParams.set('query', query);
    url.searchParams.set('pageSize', String(pageSize));
    url.searchParams.set('currentPageIndex', String(pageIndex));

    const res = await fetch(url.toString(), {
        headers: buildHeaders(context),
    });
    if (!res.ok) throw new Error(`Nuxeo API error: ${res.status} ${res.statusText}`);

    const data = await res.json();
    return {
        results: (data.entries || []).map(formatDocument),
        totalSize: data.totalSize,
        pageSize: data.pageSize,
        currentPageIndex: data.currentPageIndex,
        numberOfPages: data.numberOfPages,
    };
}

/**
 * Retrieve a document by its ID or path.
 * @param {object} input
 * @param {string} input.idOrPath - Document UUID or absolute path
 * @param {object} context
 */
export async function nuxeo_get_document(input, context) {
    const { baseUrl, fetch } = context;
    const { idOrPath } = input;

    const isPath = idOrPath.startsWith('/');
    const endpoint = isPath
        ? `/nuxeo/api/v1/path${idOrPath}`
        : `/nuxeo/api/v1/id/${idOrPath}`;

    const url = new URL(endpoint, baseUrl);
    url.searchParams.set('enrichers.document', 'acls,permissions,children');

    const res = await fetch(url.toString(), {
        headers: buildHeaders(context),
    });
    if (!res.ok) throw new Error(`Nuxeo API error: ${res.status} ${res.statusText}`);

    return formatDocument(await res.json());
}

/**
 * List child documents of a folder.
 * @param {object} input
 * @param {string} [input.parentPath='/default-domain'] - Absolute path of parent folder
 * @param {object} context
 */
export async function nuxeo_browse(input, context) {
    const { baseUrl, fetch } = context;
    const parentPath = input.parentPath || '/default-domain';

    const query = `SELECT * FROM Document WHERE ecm:parentId = (
        SELECT ecm:uuid FROM Document WHERE ecm:path = '${parentPath.replace(/'/g, "\\'")}'
    ) AND ecm:mixinType != 'HiddenInNavigation' AND ecm:isTrashed = 0`;

    const url = new URL('/nuxeo/api/v1/search/lang/NXQL/execute', baseUrl);
    url.searchParams.set('query', query);
    url.searchParams.set('pageSize', '50');

    const res = await fetch(url.toString(), {
        headers: buildHeaders(context),
    });
    if (!res.ok) throw new Error(`Nuxeo API error: ${res.status} ${res.statusText}`);

    const data = await res.json();
    return (data.entries || []).map(formatDocument);
}

/**
 * Create a new document in a specific folder.
 * @param {object} input
 * @param {string} input.parentPath - Absolute path of the parent folder
 * @param {string} input.type - Document type (e.g. 'File', 'Note')
 * @param {string} input.title - Title of the new document
 * @param {object} [input.properties] - Additional properties
 * @param {object} context
 */
export async function nuxeo_create_document(input, context) {
    const { baseUrl, fetch } = context;

    const url = new URL(`/nuxeo/api/v1/path${input.parentPath}`, baseUrl);

    const body = {
        'entity-type': 'document',
        type: input.type,
        name: input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        properties: {
            'dc:title': input.title,
            ...(input.properties || {}),
        },
    };

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
        throw new Error(err.message || `Failed to create document: ${res.status}`);
    }

    return formatDocument(await res.json());
}

/**
 * Start a workflow on a document.
 * @param {object} input
 * @param {string} input.documentId - UUID of the document
 * @param {string} input.workflowModelName - Workflow model name
 * @param {object} context
 */
export async function nuxeo_start_workflow(input, context) {
    const { baseUrl, fetch } = context;

    const url = new URL(`/nuxeo/api/v1/id/${input.documentId}/@op/Context.StartWorkflow`, baseUrl);

    const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
            ...buildHeaders(context),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            params: { id: input.workflowModelName },
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Failed to start workflow: ${res.status}`);
    }

    const workflow = await res.json();
    return {
        id: workflow.id || workflow.uid,
        name: workflow.name || input.workflowModelName,
        state: workflow.state,
    };
}

// ---- Internal helpers ----

function buildHeaders(context) {
    const headers = {};
    if (context.apiKey) {
        headers['Authorization'] = `Bearer ${context.apiKey}`;
    } else if (context.username && context.password) {
        headers['Authorization'] = 'Basic ' + btoa(`${context.username}:${context.password}`);
    }
    return headers;
}

function formatDocument(doc) {
    return {
        uid: doc.uid,
        type: doc.type,
        title: doc.title || doc.properties?.['dc:title'],
        path: doc.path,
        state: doc.state,
        creator: doc.properties?.['dc:creator'],
        created: doc.properties?.['dc:created'],
        modified: doc.properties?.['dc:modified'],
        contributors: doc.properties?.['dc:contributors'],
        description: doc.properties?.['dc:description'],
    };
}
