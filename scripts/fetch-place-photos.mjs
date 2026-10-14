#!/usr/bin/env node
/**
 * One-time: fetch Google Places photos for places missing an img.
 *
 * Usage:
 *   export GOOGLE_PLACES_API_KEY="your_key"
 *   node scripts/fetch-place-photos.mjs
 *
 * Options:
 *   --force     re-download even if img already set
 *   --limit=N   only process N places (smoke test)
 *   --dry-run   search only, don't download/write
 */

import dns from "dns";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Prefer IPv4 so IP-restricted keys (often allowlisted as v4 only) work.
dns.setDefaultResultOrder("ipv4first");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "Assets Local");
const DATA_PATH = path.join(ASSETS, "data.js");
const IMG_DIR = path.join(ASSETS, "img");

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const DRY = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

function loadEnvFile() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(ROOT, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnvFile();
const API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
if (!API_KEY) {
  console.error("Missing GOOGLE_PLACES_API_KEY. Put it in .env.local or export it.");
  process.exit(1);
}

function slugify(title) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "place";
}

function loadData() {
  const src = fs.readFileSync(DATA_PATH, "utf8");
  // eslint-disable-next-line no-new-func
  const fn = new Function(src.replace(/^const /gm, "var ") + "; return { DEFAULT_CITIES, CATS };");
  return { src, ...fn() };
}

async function textSearch(query) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": API_KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.photos,places.formattedAddress",
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1, languageCode: "en" }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Text Search ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.places && data.places[0]) || null;
}

async function downloadPhoto(photoName, outPath) {
  const url =
    `https://places.googleapis.com/v1/${photoName}/media` +
    `?maxWidthPx=1400&skipHttpRedirect=false&key=${encodeURIComponent(API_KEY)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Photo ${res.status}: ${body.slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const ctype = res.headers.get("content-type") || "";
  let ext = ".jpg";
  if (ctype.includes("png")) ext = ".png";
  else if (ctype.includes("webp")) ext = ".webp";
  const finalPath = outPath.replace(/\.(jpg|jpeg|png|webp)$/i, "") + ext;
  fs.writeFileSync(finalPath, buf);
  return finalPath;
}

function injectImg(src, title, relPath) {
  // Match `{ cat:"...", title:"TITLE"` optionally already with img, insert/replace img
  const esc = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `(\\{ cat:"[^"]+", title:"${esc}")(, img:"[^"]*")?`
  );
  if (!re.test(src)) {
    console.warn("  ! could not patch data.js for:", title);
    return src;
  }
  return src.replace(re, `$1, img:"${relPath}"`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });
  const { src: original, DEFAULT_CITIES } = loadData();
  let src = original;

  const jobs = [];
  for (const city of DEFAULT_CITIES) {
    for (const item of city.items) {
      if (!FORCE && item.img) continue;
      jobs.push({ city: city.name, item });
    }
  }

  const queue = jobs.slice(0, LIMIT);
  console.log(`Places to fetch: ${queue.length} (of ${jobs.length} missing/force)`);

  let ok = 0, skip = 0, fail = 0;
  for (let i = 0; i < queue.length; i++) {
    const { city, item } = queue[i];
    const query = [item.title, item.addr, city, "Japan"].filter(Boolean).join(" ");
    process.stdout.write(`[${i + 1}/${queue.length}] ${item.title} … `);

    try {
      const place = await textSearch(query);
      if (!place) {
        console.log("no match");
        skip++;
        await sleep(200);
        continue;
      }
      const photos = place.photos || [];
      if (!photos.length || !photos[0].name) {
        console.log("no photo", `(${place.displayName?.text || place.id})`);
        skip++;
        await sleep(200);
        continue;
      }

      if (DRY) {
        console.log("DRY", place.displayName?.text || place.id);
        ok++;
        await sleep(150);
        continue;
      }

      const slug = slugify(item.title);
      const tmp = path.join(IMG_DIR, slug + ".jpg");
      const saved = await downloadPhoto(photos[0].name, tmp);
      const rel = "img/" + path.basename(saved);
      src = injectImg(src, item.title, rel);
      console.log("→", rel, `(${place.displayName?.text || ""})`);
      ok++;
      await sleep(250);
    } catch (e) {
      console.log("FAIL", e.message);
      fail++;
      await sleep(400);
    }
  }

  if (!DRY && src !== original) {
    fs.writeFileSync(DATA_PATH, src);
    console.log("\nUpdated", DATA_PATH);
  }

  console.log(`\nDone. ok=${ok} skip=${skip} fail=${fail}`);
  if (fail) process.exitCode = 1;
}

main();
