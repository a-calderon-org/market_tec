import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('domain and application imports stay within inner layers', async () => {
  const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url));
  for (const layer of ['domain', 'application']) {
    const layerRoot = path.join(sourceRoot, layer);
    const entries = await readdir(layerRoot, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
      const file = path.join(entry.parentPath, entry.name);
      const source = await readFile(file, 'utf8');
      // Check source imports as well as type-only dependencies erased by tsc.
      for (const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
        const specifier = match[1]!;
        assert.ok(specifier.startsWith('.'), `${file} imports external dependency ${specifier}`);
        const resolved = path.resolve(path.dirname(file), specifier);
        const relative = path.relative(sourceRoot, resolved);
        const targetLayer = relative.split(path.sep)[0];
        assert.ok(targetLayer === 'domain' || (layer === 'application' && targetLayer === 'application'),
          `${layer} must not import ${specifier}`);
      }
      assert.doesNotMatch(source, /\b(?:require\s*\(|import\s*\()/, `${file} has unchecked dynamic dependency`);
    }
  }
});
