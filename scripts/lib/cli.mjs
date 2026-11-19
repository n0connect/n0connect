// CLI plumbing shared by the scripts in scripts/: repo paths, coded errors, logging, guarded file IO.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Own class so a stray fs error (which also carries .code) is never mistaken for a coded failure.
class CodedError extends Error {
  constructor(code, detail) {
    super(detail);
    this.cliCode = code;
  }
}

export function repoPath(...parts) {
  return join(ROOT, ...parts);
}

export function repoRelative(path) {
  return relative(ROOT, path);
}

export function fail(code, detail) {
  throw new CodedError(code, detail);
}

function logError(code, detail) {
  process.stderr.write(`[ ERROR ] ${code}: ${detail}\n`);
}

export function logSuccess(detail) {
  process.stdout.write(`[ SUCCESS ] ${detail}\n`);
}

// Runs main; any failure is printed as one coded line (no stack trace) and exits non-zero.
export function run(main, internalCode) {
  try {
    main();
  } catch (error) {
    logError(error instanceof CodedError ? error.cliCode : internalCode, error.message);
    process.exitCode = 1;
  }
}

export function readText(path, code, label = path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    return fail(code, `cannot read ${label} (${error.code ?? error.message})`);
  }
}

export function readJson(path, code) {
  const raw = readText(path, code);
  try {
    return JSON.parse(raw);
  } catch (error) {
    return fail(code, `invalid JSON in ${path}: ${error.message}`);
  }
}

export function writeText(path, text, code) {
  try {
    writeFileSync(path, text, "utf8");
  } catch (error) {
    fail(code, `cannot write ${path} (${error.code ?? error.message})`);
  }
}
