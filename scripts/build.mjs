import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");
const publicFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "house3d.js",
  "manifest.webmanifest",
  "favicon.svg",
  "sw.js"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of publicFiles) {
  await cp(path.join(root, file), path.join(output, file));
}

console.log(`BEKIUZ BUILD: copied ${publicFiles.length} public files into dist/.`);
console.log("Netlify Functions remain outside dist/ and are bundled by Netlify.");
