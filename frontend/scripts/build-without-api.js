/**
 * Build script that temporarily excludes the API proxy route.
 * The route uses force-dynamic which is incompatible with output: export.
 * Production uses the backend directly, so the proxy is only needed for dev.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const appDir = path.join(__dirname, "../src/app");
const apiPath = path.join(appDir, "api");
const apiBakPath = path.join(appDir, "_api_bak");

function restore() {
  if (fs.existsSync(apiBakPath)) {
    fs.renameSync(apiBakPath, apiPath);
  }
}

try {
  if (fs.existsSync(apiPath)) {
    fs.renameSync(apiPath, apiBakPath);
  }
  execSync("next build", { stdio: "inherit", cwd: path.join(__dirname, "..") });
} finally {
  restore();
}
