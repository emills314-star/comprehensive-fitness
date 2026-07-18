"use strict";

const fs = require("node:fs");
const path = require("node:path");

function readApplicationContractSource(root = path.resolve(__dirname, "..")) {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const appPath = path.join(root, "app.js");
  if (!fs.existsSync(appPath)) throw new Error(`Missing application runtime boundary: ${appPath}`);
  const app = fs.readFileSync(appPath, "utf8");
  return `${html}\n<script data-contract-source="app.js">\n${app}\n</script>`;
}

module.exports = { readApplicationContractSource };
