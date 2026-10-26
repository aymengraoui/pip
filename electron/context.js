// How full a Claude Code session's context is, for the RAM gauge on the notch:
// the token usage of the last answer in its transcript (~/.claude/projects/...jsonl).
// Only those numbers are read out of it, and nothing here may throw.

const fs = require("fs");

const TAIL = 512 * 1024; // the last answer is near the end; transcripts get big
const WINDOW = 200000;
const WINDOW_1M = 1000000;
const EVERY_MS = 2500;

const cache = new Map(); // transcript -> { at, value }

function readTail(file) {
  const fd = fs.openSync(file, "r");
  try {
    const { size } = fs.fstatSync(fd);
    const len = Math.min(size, TAIL);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    return buf.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

/** { used, max } for a transcript, or null. Cached a few seconds per file. */
function of(file) {
  if (typeof file !== "string" || !file.endsWith(".jsonl")) return null;
  const hit = cache.get(file);
  if (hit && Date.now() - hit.at < EVERY_MS) return hit.value;
  let value = null;
  try {
    const lines = readTail(file).split("\n");
    for (let i = lines.length - 1; i >= 0 && !value; i--) {
      if (!lines[i].includes('"usage"')) continue;
      let entry;
      try { entry = JSON.parse(lines[i]); } catch { continue; } // the tail's first line is cut
      const u = entry && entry.message && entry.message.usage;
      if (entry.type !== "assistant" || entry.isSidechain || !u) continue;
      const used = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0)
        + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0);
      // The 1M window isn't written down anywhere in there: past 200k it has to be that one.
      value = { used, max: used > WINDOW ? WINDOW_1M : WINDOW };
    }
  } catch {
    value = null;
  }
  cache.set(file, { at: Date.now(), value });
  if (cache.size > 64) cache.delete(cache.keys().next().value);
  return value;
}

module.exports = { of };
