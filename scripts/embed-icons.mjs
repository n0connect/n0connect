// Usage: node scripts/embed-icons.mjs
// Embeds assets/icons/<key>.svg as data-URI logos into the matching shields.io badges in README.md.

import { fail, logSuccess, readText, repoPath, run, writeText } from "./lib/cli.mjs";

// ---- constants -------------------------------------------------------------
const README_PATH = repoPath("README.md");
const ICON_PATH = (key) => repoPath("assets", "icons", `${key}.svg`);
const SHIELDS_BASE = "https://img.shields.io/badge/";
const BADGE_BG = "0D1117";
const BADGE_STYLE = "for-the-badge";
const DATA_URI_PREFIX = "data:image/svg+xml;base64,";
const PLACEHOLDER = (key) => `<!-- BADGE:${key} -->`;
const MARKER = (key) => `<!-- icon:${key} -->`;
const ERR = {
  ICON: "E_ICONS_001",
  README: "E_ICONS_002",
  WRITE: "E_ICONS_003",
  INTERNAL: "E_ICONS_000",
};
const BADGES = {
  nmap: { label: "Nmap", alt: "Nmap" },
  sqlmap: { label: "sqlmap", alt: "sqlmap" },
  nuclei: { label: "Nuclei", alt: "Nuclei" },
  ffuf: { label: "ffuf", alt: "ffuf" },
  semgrep: { label: "Semgrep", alt: "Semgrep" },
  ghidra: { label: "Ghidra", alt: "Ghidra" },
  radare2: { label: "radare2", alt: "radare2" },
  webcrypto: { label: "WebCrypto", alt: "Web Crypto API" },
  tpm: { label: "TPM_2.0", alt: "TPM 2.0" },
  codex: { label: "Codex_CLI", alt: "Codex CLI" },
  mlx: { label: "MLX", alt: "MLX" },
  linkedin: { label: "LinkedIn", alt: "LinkedIn" },
  ida: { label: "IDA_Pro", alt: "IDA Pro" },
  binaryninja: { label: "Binary_Ninja", alt: "Binary Ninja" },
  hopper: { label: "Hopper", alt: "Hopper Disassembler" },
  jadx: { label: "jadx", alt: "jadx" },
};

// ---- badge building ----------------------------------------------------------
function logoParam(svg) {
  const dataUri = DATA_URI_PREFIX + Buffer.from(svg.trim(), "utf8").toString("base64");
  return encodeURIComponent(dataUri);
}

function badgeLine(key, { label, alt }, svg) {
  const src = `${SHIELDS_BASE}${label}-${BADGE_BG}?style=${BADGE_STYLE}&amp;logo=${logoParam(svg)}`;
  return `<img src="${src}" alt="${alt}" />${MARKER(key)}`;
}

// ---- readme rewriting --------------------------------------------------------
// Replaces every whole line holding the key"s placeholder or marker, keeping its indent.
function replaceKeyLines(lines, key, content) {
  let hits = 0;
  const out = lines.map((line) => {
    if (!line.includes(PLACEHOLDER(key)) && !line.includes(MARKER(key))) return line;
    hits += 1;
    return line.match(/^\s*/)[0] + content;
  });
  if (hits === 0) fail(ERR.README, `README.md has neither placeholder nor marker for "${key}"`);
  return out;
}

function main() {
  const original = readText(README_PATH, ERR.README, `README ${README_PATH}`);
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  let lines = original.split(eol);
  for (const [key, meta] of Object.entries(BADGES)) {
    const iconPath = ICON_PATH(key);
    const svg = readText(iconPath, ERR.ICON, `icon ${iconPath}`);
    lines = replaceKeyLines(lines, key, badgeLine(key, meta, svg));
  }
  const updated = lines.join(eol);
  if (updated !== original) writeText(README_PATH, updated, ERR.WRITE);
  logSuccess(`embedded ${Object.keys(BADGES).length} icons into README.md`);
}

run(main, ERR.INTERNAL);
