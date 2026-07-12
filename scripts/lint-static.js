"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { validateWorkflows } = require("./validate-workflows.js");

const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRECTORIES = new Set([
  ".git", ".vercel-data", "artifacts", "node_modules", "dist", "coverage",
  "DerivedData", "Pods", "build"
]);
const JS_EXTENSIONS = new Set([".js", ".cjs", ".mjs"]);
const TEXT_EXTENSIONS = new Set([
  ".css", ".html", ".js", ".cjs", ".mjs", ".json", ".md", ".ps1",
  ".toml", ".txt", ".xml", ".yaml", ".yml"
]);

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, files);
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function relative(file) {
  return path.relative(ROOT, file).replaceAll(path.sep, "/");
}

function lintStatic() {
  const files = walk(ROOT).sort((left, right) => left.localeCompare(right));
  const errors = [];
  let checkedJavaScript = 0;
  let checkedJson = 0;
  let checkedInlineScripts = 0;

  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    if (TEXT_EXTENSIONS.has(extension)) {
      const source = fs.readFileSync(file, "utf8");
      if (source.includes("\0")) errors.push(`${relative(file)}: contains a NUL byte`);
      if (/^(?:<{7}|={7}|>{7})/m.test(source)) errors.push(`${relative(file)}: contains an unresolved merge marker`);
    }

    if (JS_EXTENSIONS.has(extension)) {
      checkedJavaScript += 1;
      try {
        new vm.Script(fs.readFileSync(file, "utf8"), { filename: relative(file) });
      } catch (error) {
        errors.push(`${relative(file)}: ${error.message}`);
      }
    }

    if (extension === ".json") {
      checkedJson += 1;
      try {
        JSON.parse(fs.readFileSync(file, "utf8"));
      } catch (error) {
        errors.push(`${relative(file)}: invalid JSON (${error.message})`);
      }
    }

    if (extension === ".html") {
      const html = fs.readFileSync(file, "utf8");
      for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        const attributes = match[1];
        const body = match[2];
        if (/\bsrc\s*=/i.test(attributes)) continue;
        const type = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
        if (type && !["text/javascript", "application/javascript"].includes(type)) continue;
        checkedInlineScripts += 1;
        try {
          // Function construction is a dependency-free parse check; the body is never executed.
          new Function(body);
        } catch (error) {
          errors.push(`${relative(file)}: invalid inline script (${error.message})`);
        }
      }
    }
  }

  errors.push(...validateWorkflows());
  const hasTypeScript = files.some((file) => /(?:\.tsx?|tsconfig\.json)$/i.test(file));

  if (errors.length > 0) {
    console.error("Static lint failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Static lint passed (${checkedJavaScript} JavaScript files, ${checkedJson} JSON files, ${checkedInlineScripts} inline scripts).`);
  console.log(hasTypeScript
    ? "TypeScript sources detected: this dependency-free check validates JavaScript only; add a project typecheck before introducing TypeScript."
    : "TypeScript typecheck: not applicable (no TypeScript sources or tsconfig)."
  );
  console.log("JSON schemas and data contracts execute separately through the public test gate.");
}

lintStatic();
