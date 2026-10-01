// Keeps only the current version's installer in release/.
//
// Runs at the end of `npm run dist`, so every build leaves exactly one
// Pip-Setup-<version>.exe behind instead of a pile of 100 MB installers. It runs
// *after* the build on purpose: a failed build leaves the previous installer
// where it was rather than deleting it and giving you nothing.
//
// Old releases stay downloadable on GitHub; this only tidies the build folder.

const fs = require("fs");
const path = require("path");

const { version } = require("../package.json");
const dir = path.join(__dirname, "..", "release");
// Anything electron-builder names after a version: the installer, its blockmap,
// the uninstaller it stages next to them.
const VERSIONED = /^Pip-Setup-(\d+\.\d+\.\d+)\./;

if (!fs.existsSync(dir)) process.exit(0);

let freed = 0;
const gone = [];
for (const name of fs.readdirSync(dir)) {
  const match = VERSIONED.exec(name);
  if (!match || match[1] === version) continue;
  const file = path.join(dir, name);
  try {
    freed += fs.statSync(file).size;
    fs.rmSync(file, { recursive: true, force: true });
    gone.push(name);
  } catch (err) {
    console.warn(`could not remove ${name}: ${err.message}`);
  }
}

if (gone.length) {
  console.log(`pruned ${gone.length} file(s) from older versions, freeing ${(freed / 1048576).toFixed(0)} MB:`);
  for (const name of gone) console.log(`  ${name}`);
} else {
  console.log(`release/ is already just ${version}`);
}
