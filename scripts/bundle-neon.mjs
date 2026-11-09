import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export async function bundleNeon(fn) {
  const result = await build({
    entryPoints: [fn.source],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    write: false,
    outfile: 'index.mjs',
    external: ['argon2'],
    banner: {
      js: "import{createRequire}from'node:module';const require=createRequire(import.meta.url);",
    },
  });
  const files = { 'index.mjs': result.outputFiles[0].contents };
  // These packages publish their ARM64 Linux prebuilds in the npm tarball.
  // Copy only the target binary, never the Windows addon used in local development.
  for (const name of ['argon2', 'node-gyp-build', '@phc/format']) {
    const root = path.dirname(require.resolve(`${name}/package.json`));
    async function visit(dir, relative = '') {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const rel = path.posix.join(relative, entry.name);
        if (rel === 'node_modules' || rel === 'test' || rel === 'tests') continue;
        if (rel.startsWith('prebuilds/') && !rel.startsWith('prebuilds/linux-arm64')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await visit(full, rel);
        else files[`node_modules/${name}/${rel}`] = new Uint8Array(await readFile(full));
      }
    }
    await visit(root);
  }
  return files;
}
