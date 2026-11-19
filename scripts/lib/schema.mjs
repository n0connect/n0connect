// JSON shape checks shared by the card generators; every failure is raised under the caller's code.

import { fail } from "./cli.mjs";

const ACCENT_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function makeSchema(code) {
  return {
    root(value) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code, "root must be an object");
      return value;
    },
    object(value, where) {
      if (value === null || typeof value !== "object") fail(code, `${where} must be an object`);
      return value;
    },
    string(value, where) {
      if (!isNonEmptyString(value)) fail(code, `${where} must be a non-empty string`);
      return value;
    },
    accent(value, where) {
      if (typeof value !== "string" || !ACCENT_PATTERN.test(value)) {
        fail(code, `${where} (${JSON.stringify(value)}) must be #RRGGBB`);
      }
      return value;
    },
    array(value, where) {
      if (!Array.isArray(value) || value.length === 0) fail(code, `${where} must be a non-empty array`);
      return value;
    },
  };
}
