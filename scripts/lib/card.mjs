// The dark "terminal card" shared by the generated SVGs: theme, formatting, frame, header, section titles.

export const THEME = {
  card: { width: 880, radius: 12, padX: 24, padBottom: 22, borderWidth: 1 }, // padBottom: last baseline to the bottom edge, matching the header's top margin
  colors: {
    background: "#0D1117",
    surface: "#161B22",
    border: "#30363D",
    grid: "#21262D",
    connector: "#484F58",
    primary: "#E6EDF3",
    muted: "#8B949E",
    prompt: "#3FB950",
  },
  font: {
    family: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    charWidthEm: 0.6, // monospace advance estimate used for fitting and wrapping
    header: 13,
    sectionTitle: 12,
    sectionTitleLetterSpacing: 1.5,
  },
  header: { height: 48, baseline: 30 },
  section: {
    titleHeight: 24, // space for the section title row
    titleBaseline: 14,
    markerWidth: 18, // accent rule before the section title
    markerHeight: 3,
    markerGap: 8,
  },
  decimals: 2,
};

export const KEYFRAMES = {
  draw: "@keyframes draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }",
  fade: "@keyframes fade { from { opacity: 0; } to { opacity: 1; } }",
};

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export function num(value) {
  const factor = 10 ** THEME.decimals;
  const rounded = Math.round(value * factor) / factor;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function attrs(map) {
  return Object.entries(map)
    .map(([key, value]) => `${key}="${typeof value === "number" ? num(value) : escapeXml(value)}"`)
    .join(" ");
}

// ---------------------------------------------------------------------------
// Text metrics (character-count estimate; monospace makes it reliable)
// ---------------------------------------------------------------------------
function charWidth(fontSize) {
  return fontSize * THEME.font.charWidthEm;
}

export function textWidth(text, fontSize, letterSpacing = 0) {
  const chars = [...text].length;
  return chars * charWidth(fontSize) + Math.max(0, chars - 1) * letterSpacing;
}

export function maxChars(width, fontSize) {
  return Math.floor(width / charWidth(fontSize));
}

// ---------------------------------------------------------------------------
// Card layers
// ---------------------------------------------------------------------------
// `contentBottom` is the baseline of the lowest content line.
export function cardHeight(contentBottom) {
  return contentBottom + THEME.card.padBottom;
}

// Static rules first, animation rules only when the viewer allows motion.
export function renderStyle(motionRules) {
  return [
    "  <style>",
    `    text { font-family: ${THEME.font.family}; }`,
    "    @media (prefers-reduced-motion: no-preference) {",
    ...motionRules.map((rule) => `      ${rule}`),
    "    }",
    "  </style>",
  ];
}

function renderFrame(height) {
  const { card, colors } = THEME;
  const inset = card.borderWidth / 2;
  return [
    `  <rect ${attrs({
      x: inset,
      y: inset,
      width: card.width - card.borderWidth,
      height: height - card.borderWidth,
      rx: card.radius,
      fill: colors.background,
      stroke: colors.border,
      "stroke-width": card.borderWidth,
    })}/>`,
  ];
}

// The "$ command" line: green prompt sign, the command in muted.
function renderHeader(command) {
  const { card, colors, font, header } = THEME;
  return [
    `  <text ${attrs({ x: card.padX, y: header.baseline, "font-size": font.header, fill: colors.muted })}>` +
      `<tspan fill="${colors.prompt}">$</tspan> ${escapeXml(command)}</text>`,
  ];
}

// Accent rule plus UPPERCASE letter-spaced title; sits inside a section group.
export function renderSectionTitle({ title, top, accent }) {
  const { card, font, section } = THEME;
  const markerY = top + section.titleBaseline - font.sectionTitle / 2 + section.markerHeight / 2;
  return [
    `    <rect ${attrs({
      x: card.padX,
      y: markerY - section.markerHeight,
      width: section.markerWidth,
      height: section.markerHeight,
      rx: section.markerHeight / 2,
      fill: accent,
    })}/>`,
    `    <text ${attrs({
      x: card.padX + section.markerWidth + section.markerGap,
      y: top + section.titleBaseline,
      "font-size": font.sectionTitle,
      "font-weight": "bold",
      "letter-spacing": font.sectionTitleLetterSpacing,
      fill: accent,
    })}>${escapeXml(title.toUpperCase())}</text>`,
  ];
}

// The whole document: frame, "$ prompt" header, caller body. `head` holds <style>/<defs>.
export function renderCardSvg({ height, title, desc, head, prompt, body }) {
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(THEME.card.width)} ${num(height)}" role="img" aria-labelledby="title desc">`,
    `  <title id="title">${escapeXml(title)}</title>`,
    `  <desc id="desc">${escapeXml(desc)}</desc>`,
    ...head,
    ...renderFrame(height),
    ...renderHeader(prompt),
    ...body,
    "</svg>",
  ];
  return `${lines.join("\n")}\n`;
}
