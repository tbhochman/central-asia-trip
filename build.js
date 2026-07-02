// Encrypts data.js -> data.enc.js using AES-256-GCM with PBKDF2-derived key.
// Usage:  PASSWORD='your-password' node build.js

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const password = process.env.PASSWORD;
if (!password) {
  console.error("Set PASSWORD env var. Example: PASSWORD='secret' node build.js");
  process.exit(1);
}
const dataPath = path.join(__dirname, "data.js");
const outPath = path.join(__dirname, "data.enc.js");

// Load the trip data via require (data.js exports it).
delete require.cache[dataPath];
const tripData = require(dataPath);

if (!tripData || !tripData.STOPS || !tripData.LOGISTICS) {
  console.error("data.js did not export {STOPS, LOGISTICS}.");
  process.exit(1);
}

const json = JSON.stringify(tripData);

const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const ITER = 200_000;
const key = crypto.pbkdf2Sync(password, salt, ITER, 32, "sha256");

const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const ct = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
const tag = cipher.getAuthTag();

// Layout: [16B salt][12B iv][16B tag][...ct]
const blob = Buffer.concat([salt, iv, tag, ct]).toString("base64");

// Write as JSON, fetched at runtime with no-cache so updates show without a hard refresh.
// Layout in `blob`: salt(16) | iv(12) | tag(16) | ct.
const jsonOut = JSON.stringify({ blob, iter: ITER, alg: "AES-256-GCM", kdf: "PBKDF2-SHA256" });
const jsonPath = path.join(__dirname, "data.enc.json");
fs.writeFileSync(jsonPath, jsonOut);
console.log(`Wrote ${jsonPath} (${ct.length} bytes ciphertext, ${blob.length} chars base64)`);

// Stamp the service worker with a shell version = hash of the app-shell
// files. When any of them changes, sw.js changes too, which triggers the
// browser's service-worker update flow on installed PWAs.
const shellFiles = ["index.html", "app.js", "style.css", "manifest.json"];
const shellHash = crypto
  .createHash("sha256")
  .update(shellFiles.map((f) => fs.readFileSync(path.join(__dirname, f))).join("\n"))
  .digest("hex")
  .slice(0, 12);
const swPath = path.join(__dirname, "sw.js");
const swSrc = fs.readFileSync(swPath, "utf8");
const swOut = swSrc.replace(/const VERSION = "[^"]*";/, `const VERSION = "${shellHash}";`);
if (swOut !== swSrc) fs.writeFileSync(swPath, swOut);
console.log(`Shell version: ${shellHash}`);

// Encrypt ticket files (tickets/ → tickets-enc/*.enc). Same password, same
// self-contained binary layout: salt(16) | iv(12) | tag(16) | ct.
const ticketsDir = path.join(__dirname, "tickets");
const ticketsOut = path.join(__dirname, "tickets-enc");
if (fs.existsSync(ticketsDir)) {
  fs.mkdirSync(ticketsOut, { recursive: true });
  for (const name of fs.readdirSync(ticketsDir)) {
    if (name.startsWith(".")) continue;
    const plain = fs.readFileSync(path.join(ticketsDir, name));
    const tSalt = crypto.randomBytes(16);
    const tIv = crypto.randomBytes(12);
    const tKey = crypto.pbkdf2Sync(password, tSalt, ITER, 32, "sha256");
    const tCipher = crypto.createCipheriv("aes-256-gcm", tKey, tIv);
    const tCt = Buffer.concat([tCipher.update(plain), tCipher.final()]);
    const outFile = path.join(ticketsOut, name + ".enc");
    fs.writeFileSync(outFile, Buffer.concat([tSalt, tIv, tCipher.getAuthTag(), tCt]));
    console.log(`Encrypted ticket: ${name} → tickets-enc/${name}.enc (${tCt.length} bytes)`);
  }
}
