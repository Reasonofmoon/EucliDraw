import { stripTypeScriptTypes } from 'node:module';
import { mkdir, readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const root = fileURLToPath(new URL('../', import.meta.url));
export async function build() {
  const destination = path.join(root, 'dist');
  await mkdir(destination, { recursive: true });
  for (const filename of await readdir(path.join(root, 'src'))) {
    if (filename.endsWith('.ts')) {
      const source = await readFile(path.join(root, 'src', filename), 'utf8');
      const output = stripTypeScriptTypes(source).replace(/from (['"])(\.\/[^'"]+)\.ts\1/g, 'from $1$2.js$1');
      await writeFile(path.join(destination, filename.replace(/\.ts$/, '.js')), output);
    } else if (filename.endsWith('.css')) await copyFile(path.join(root, 'src', filename), path.join(destination, filename));
  }
  await copyFile(path.join(root, 'index.html'), path.join(destination, 'index.html'));
  console.log('Built EucliDraw → web/dist');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await build();
