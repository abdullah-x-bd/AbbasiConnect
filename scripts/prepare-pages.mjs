import { readFile, writeFile } from "node:fs/promises";

const path = "apps/web/src/App.tsx";
let source = await readFile(path, "utf8");

source = source
  .replaceAll('window.location.replace("/admin")', 'window.location.replace(`${import.meta.env.BASE_URL}?admin=1`)')
  .replaceAll('window.location.assign("/admin")', 'window.location.assign(`${import.meta.env.BASE_URL}?admin=1`)');

await writeFile(path, source);
console.log("Prepared AbbasiConnect routes for GitHub Pages.");
