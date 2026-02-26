// ============================================================
// Schema Validation Tests
// Ensures all config.json files conform to schema.json
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const repoRoot = resolve(__dirname, '..');

/**
 * Load and validate a config.json file against the expected structure.
 * We do structural validation (since we don't ship a JSON Schema validator).
 */
function loadConfig(toolDir) {
    const configPath = join(repoRoot, toolDir, 'config.json');
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw);
}

function getToolDirs() {
    return readdirSync(repoRoot)
        .filter(name =>
            !name.startsWith('.') &&
            !name.startsWith('_') &&
            name !== 'node_modules' &&
            name !== 'tests' &&
            statSync(join(repoRoot, name)).isDirectory()
        );
}

const toolDirs = getToolDirs();

describe('Config Schema Compliance', () => {
    it('should find at least one tool directory', () => {
        assert.ok(toolDirs.length > 0, `Found ${toolDirs.length} tool directories`);
    });

    for (const dir of toolDirs) {
        describe(`${dir}/config.json`, () => {
            let config;

            it('should be valid JSON', () => {
                config = loadConfig(dir);
                assert.ok(typeof config === 'object');
            });

            it('should have required string fields: id, name, description, category, icon, version, author', () => {
                config = loadConfig(dir);
                for (const field of ['id', 'name', 'description', 'category', 'icon', 'version', 'author']) {
                    assert.ok(typeof config[field] === 'string', `Missing or non-string field: ${field}`);
                    assert.ok(config[field].length > 0, `Field ${field} should not be empty`);
                }
            });

            it('id should match the folder name', () => {
                config = loadConfig(dir);
                assert.equal(config.id, dir, `id "${config.id}" does not match folder "${dir}"`);
            });

            it('id should be lowercase kebab-case', () => {
                config = loadConfig(dir);
                assert.ok(/^[a-z0-9-]+$/.test(config.id), `id "${config.id}" is not lowercase kebab-case`);
            });

            it('version should be semver', () => {
                config = loadConfig(dir);
                assert.ok(/^\d+\.\d+\.\d+$/.test(config.version), `version "${config.version}" is not valid semver`);
            });

            it('tags should be a non-empty string array', () => {
                config = loadConfig(dir);
                assert.ok(Array.isArray(config.tags), 'tags should be an array');
                assert.ok(config.tags.length > 0, 'tags should not be empty');
                for (const tag of config.tags) {
                    assert.ok(typeof tag === 'string', `tag should be a string, got ${typeof tag}`);
                }
            });

            it('tools should be a non-empty array', () => {
                config = loadConfig(dir);
                assert.ok(Array.isArray(config.tools), 'tools should be an array');
                assert.ok(config.tools.length > 0, 'tools should not be empty');
            });

            it('each tool should have name, description, inputSchema, readOnly', () => {
                config = loadConfig(dir);
                for (const tool of config.tools) {
                    assert.ok(typeof tool.name === 'string' && tool.name.length > 0, `tool missing name`);
                    assert.ok(typeof tool.description === 'string' && tool.description.length > 0, `tool ${tool.name} missing description`);
                    assert.ok(typeof tool.inputSchema === 'object', `tool ${tool.name} missing inputSchema`);
                    assert.ok(typeof tool.readOnly === 'boolean', `tool ${tool.name} missing readOnly (boolean)`);
                }
            });

            it('tool names should be lowercase snake_case', () => {
                config = loadConfig(dir);
                for (const tool of config.tools) {
                    assert.ok(
                        /^[a-z_][a-z0-9_]*$/.test(tool.name),
                        `tool name "${tool.name}" is not lowercase snake_case`
                    );
                }
            });

            it('inputSchema should have type: "object" and properties', () => {
                config = loadConfig(dir);
                for (const tool of config.tools) {
                    assert.equal(tool.inputSchema.type, 'object', `tool ${tool.name} inputSchema.type should be "object"`);
                    assert.ok(
                        typeof tool.inputSchema.properties === 'object',
                        `tool ${tool.name} inputSchema missing properties`
                    );
                }
            });
        });
    }
});

describe('Handler exports match config', () => {
    for (const dir of toolDirs) {
        it(`${dir}/handler.js should export all tools defined in config.json`, async () => {
            const config = loadConfig(dir);
            const handler = await import(`../` + dir + '/handler.js');

            for (const tool of config.tools) {
                assert.ok(
                    typeof handler[tool.name] === 'function',
                    `handler.js is missing export "${tool.name}" (defined in config.json)`
                );
            }
        });

        it(`${dir}/handler.js should not export unexpected functions`, async () => {
            const config = loadConfig(dir);
            const handler = await import(`../` + dir + '/handler.js');
            const configNames = new Set(config.tools.map(t => t.name));

            for (const key of Object.keys(handler)) {
                assert.ok(
                    configNames.has(key),
                    `handler.js exports "${key}" which is not in config.json tools`
                );
            }
        });
    }
});
