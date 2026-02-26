# WebMCP Tools

**Open-source tool implementations for the [Web-MCP.tools](https://web-mcp.tools/) platform.**

Each tool is a self-contained folder with:
- `config.json` — metadata, schema definitions, and tool descriptions
- `handler.js` — ESM module with the actual tool implementation

## Available Tools

| Tool | Category | Description |
|------|----------|-------------|
| [wordpress](./wordpress) | CMS | Search posts, get pages, manage comments via the WP REST API |
| [nuxeo](./nuxeo) | Enterprise CMS/DAM | Search, browse, create documents, and start workflows |
| [e-commerce](./e-commerce) | E-Commerce | Search products, manage cart, check order status |
| [generic-website](./generic-website) | Starter | Search content, get page info, submit forms |

## Handler API

Every function in `handler.js` follows this signature:

```js
export async function tool_name(input, context) {
    // input  — validated against the tool's inputSchema
    // context — injected by the WebMCP platform:
    //   { baseUrl, apiKey?, fetch }
    return result;
}
```

### Context Object

| Field | Type | Description |
|-------|------|-------------|
| `baseUrl` | `string` | The target site's base URL (configured by the user) |
| `apiKey` | `string?` | Optional authentication token |
| `fetch` | `function` | Fetch function (browser `fetch` or a server-side polyfill) |

## Contributing

We welcome contributions! To add a new tool:

1. Create a folder named after your tool (lowercase, kebab-case)
2. Add a `config.json` following the [schema](./schema.json)
3. Add a `handler.js` with ESM exports matching the tool names in your config
4. Submit a pull request

### Guidelines

- **Pure logic** — handlers should not hardcode URLs or credentials; use `context`
- **Error handling** — throw descriptive errors on API failures
- **No dependencies** — handlers should only use `context.fetch` for HTTP calls
- **Document your code** — add JSDoc comments to every export

## License

Apache-2.0
