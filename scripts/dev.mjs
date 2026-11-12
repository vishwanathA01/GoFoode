// Starts the GoFoode API and website together: `npm run dev` from the project root.
// Checks the things that usually go wrong first (missing packages, MongoDB not running, port taken)
// and explains how to fix them instead of failing with a stack trace.
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "server");
const clientDir = path.join(root, "client");
const isWindows = process.platform === "win32";
const npm = isWindows ? "npm.cmd" : "npm";
const color = (code, text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const say = text => console.log(color("1;33", "[gofoode]"), text);
const fail = (title, ...lines) => { console.error(`\n${color("1;31", "✗")} ${title}`); for (const line of lines) console.error(`  ${line}`); console.error(""); process.exit(1); };

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  const values = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

function ensureInstalled(dir, label) {
  if (fs.existsSync(path.join(dir, "node_modules"))) return;
  say(`Installing ${label} packages (first run only)…`);
  const result = spawnSync(npm, ["install"], { cwd: dir, stdio: "inherit", shell: isWindows });
  if (result.status !== 0) fail(`Couldn't install the ${label} packages.`, `Run "npm install" inside ${path.relative(root, dir) || "."} and read the error above.`);
}

const canConnect = (host, port, timeout = 2500) => new Promise(resolve => {
  const socket = net.connect({ host, port });
  const done = ok => { socket.destroy(); resolve(ok); };
  socket.setTimeout(timeout, () => done(false));
  socket.once("connect", () => done(true));
  socket.once("error", () => done(false));
});

// A port only counts as free if nothing is bound to it on ANY address. On macOS another app can hold
// localhost:5174 while we bind 0.0.0.0:5174, and then "localhost:5174" quietly opens the other app.
const canBind = (port, host) => new Promise(resolve => {
  const probe = net.createServer();
  probe.once("error", error => resolve(error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT"));
  probe.once("listening", () => probe.close(() => resolve(true)));
  host ? probe.listen(port, host) : probe.listen(port);
});
const isPortFree = async port => (await canBind(port, "127.0.0.1")) && (await canBind(port, "::1")) && (await canBind(port, "0.0.0.0")) && (await canBind(port));
async function findFreePort(start) {
  for (let port = start; port < start + 20; port += 1) if (await isPortFree(port)) return port;
  fail(`No free port found between ${start} and ${start + 19}.`, "Stop some other dev servers and try again.");
}

async function waitForUrl(url, child, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) return false;
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return true; } catch { /* not up yet */ }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  return false;
}

async function waitForApi(port, child, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) return false;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return true;
    } catch { /* not up yet */ }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  return false;
}

function run(label, tint, dir, args, env) {
  const child = spawn(npm, args, { cwd: dir, env: { ...process.env, ...env, FORCE_COLOR: "1" }, shell: isWindows });
  const prefix = color(tint, `[${label}]`);
  const pipe = stream => {
    let buffered = "";
    stream.on("data", chunk => {
      buffered += chunk.toString();
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop();
      for (const line of lines) if (line.trim()) console.log(`${prefix} ${line}`);
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  return child;
}

// ---------------------------------------------------------------------------------------------------------
const [major] = process.versions.node.split(".").map(Number);
if (major < 20) fail(`Node.js ${process.versions.node} is too old.`, "Install Node.js 20 or newer from https://nodejs.org and run this again.");

ensureInstalled(serverDir, "API");
ensureInstalled(clientDir, "website");

const serverEnv = readEnv(path.join(serverDir, ".env"));
const mongoUri = process.env.MONGODB_URI || serverEnv.MONGODB_URI || "mongodb://127.0.0.1:27017/dineflow";
const local = mongoUri.match(/^mongodb:\/\/(?:[^@/]*@)?([^/:,?]+)(?::(\d+))?/);
if (local) {
  const [, host, port = "27017"] = local;
  if (!(await canConnect(host, Number(port)))) {
    fail(`MongoDB isn't reachable at ${host}:${port}.`,
      "Start it, then run `npm run dev` again:",
      "  macOS (Homebrew):  brew services start mongodb-community",
      "  Docker:            docker run -d -p 27017:27017 --name gofoode-mongo mongo:7",
      "Or put a MongoDB Atlas connection string in server/.env as MONGODB_URI.");
  }
}

const preferredPort = Number(process.env.PORT || serverEnv.PORT || 5001);
const apiPort = await findFreePort(preferredPort);
if (apiPort !== preferredPort) say(`Port ${preferredPort} is busy (another project is using it), so the API will use ${apiPort}.`);

say("Starting the API…");
const api = run("api", "36", serverDir, ["run", "dev"], { PORT: String(apiPort) });
const children = [api];
let stopping = false;
const stopAll = code => {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill("SIGINT");
  setTimeout(() => process.exit(code), 1500).unref();
};
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
api.on("exit", code => { if (!stopping) { console.error(color("1;31", "\n✗ The API stopped. See the [api] messages above.")); stopAll(code || 1); } });

if (!(await waitForApi(apiPort, api))) {
  if (!stopping) { console.error(color("1;31", "\n✗ The API didn't come up within 30 seconds. See the [api] messages above.")); stopAll(1); }
} else {
  say(`API ready on http://localhost:${apiPort}`);
  const webPort = await findFreePort(Number(process.env.WEB_PORT || 5173));
  say("Starting the website…");
  const web = run("web", "35", clientDir, ["run", "dev", "--", "--port", String(webPort), "--strictPort"], { GOFOODE_API_PORT: String(apiPort) });
  children.push(web);
  web.on("exit", code => { if (!stopping) { console.error(color("1;31", "\n✗ The website dev server stopped. See the [web] messages above.")); stopAll(code || 1); } });
  const webUp = await waitForUrl(`http://127.0.0.1:${webPort}/`, web);
  if (webUp) {
    console.log(`\n  ${color("1;32", "GoFoode is running")}  →  ${color("1;4", `http://localhost:${webPort}`)}`);
    console.log(`  On your phone (same Wi-Fi): use the Network URL above.  Stop with Ctrl+C.\n`);
  }
}
