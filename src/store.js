/**
 * Check history. Every finished check is kept by id (so "why that score?" can
 * refer back to it) and listed per listener, so a later session can answer
 * "what did I check yesterday?". Persisted to data/checks.json; swap for the
 * Veridex MongoDB in production.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

// Serverless hosts (Vercel) only allow writes under the temp directory, and
// it lasts as long as the warm instance does.
const FILE = process.env.VERCEL
  ? path.join(os.tmpdir(), "fact-pulse-checks.json")
  : path.join(__dirname, "..", "data", "checks.json");
const MAX_CHECKS = 500;

let checks = new Map();
try {
  checks = new Map(JSON.parse(fs.readFileSync(FILE, "utf8")).map(c => [c.id, c]));
} catch { /* first run */ }

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const all = [...checks.values()].slice(-MAX_CHECKS);
    fs.mkdir(path.dirname(FILE), { recursive: true }, () =>
      fs.writeFile(FILE, JSON.stringify(all, null, 1), () => {}));
  }, 500);
}

const newId = () => crypto.randomBytes(5).toString("hex");

function put(check) {
  checks.delete(check.id);
  checks.set(check.id, check);
  if (checks.size > MAX_CHECKS) checks.delete(checks.keys().next().value);
  scheduleSave();
  return check;
}

const get = id => checks.get(id) || null;

function latestFor(listener) {
  const all = [...checks.values()].filter(c => c.listener === listener && c.status === "done");
  return all[all.length - 1] || null;
}

function recentFor(listener, limit = 5) {
  return [...checks.values()].filter(c => c.listener === listener && c.status === "done").slice(-limit).reverse();
}

module.exports = { put, get, newId, latestFor, recentFor };
