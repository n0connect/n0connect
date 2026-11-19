// Usage: node scripts/render-skills.mjs   (reads assets/skills.json, writes assets/skills.svg)

import { THEME, KEYFRAMES, num, escapeXml, attrs, maxChars, cardHeight, renderStyle, renderSectionTitle, renderCardSvg } from "./lib/card.mjs";
import { fail, logSuccess, readJson, repoPath, repoRelative, run, writeText } from "./lib/cli.mjs";
import { makeSchema } from "./lib/schema.mjs";

// ---------------------------------------------------------------------------
// Configuration: every tunable lives here (shared card look: lib/card.mjs THEME).
// ---------------------------------------------------------------------------
const CONFIG = {
  paths: {
    input: repoPath("assets", "skills.json"),
    output: repoPath("assets", "skills.svg"),
  },
  font: {
    tick: 11,
    value: 11,
    label: 11,
  },
  panel: {
    headroom: 22, // room above the plot for value labels
    plotHeight: 120,
    labelGap: 18, // axis to first label baseline
    labelLineHeight: 14,
    labelLines: 2,
    bottomGap: 24, // last label baseline to the next panel
    axisLabelWidth: 36, // left column reserved for y tick labels
    tickLabelGap: 10,
    slotPadding: 8, // horizontal breathing room inside each x slot
  },
  axis: {
    floor: 4, // visible baseline; lowered automatically if a score falls below it
    tickStep: 2,
    gridWidth: 1,
  },
  series: {
    lineWidth: 2.25,
    dotRadius: 4,
    dotRing: 2,
    valueOffset: 10, // value label baseline above the dot centre
    areaTopOpacity: 0.28,
    areaBottomOpacity: 0,
  },
  animation: {
    lineDuration: 1.2,
    panelStagger: 0.25,
    areaDelay: 0.3,
    areaDuration: 0.9,
    marksDuration: 0.5,
  },
};

const ERRORS = {
  INPUT: "E_SKILLS_001",
  SCHEMA: "E_SKILLS_002",
  WRITE: "E_SKILLS_003",
  INTERNAL: "E_SKILLS_000",
};

const WRAP_SEPARATOR = " · ";
const schema = makeSchema(ERRORS.SCHEMA);

function numberIn(value, where, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    fail(ERRORS.SCHEMA, `${where} (${JSON.stringify(value)}) must be a finite number within ${min}..${max}`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------
function validateSkill(skill, where, scale) {
  schema.object(skill, where);
  schema.string(skill.name, `${where}.name`);
  numberIn(skill.score, `${where}.score`, 0, scale);
}

function validateGroup(group, where, scale) {
  schema.object(group, where);
  schema.string(group.name, `${where}.name`);
  schema.accent(group.accent, `${where}.accent`);
  schema.array(group.skills, `${where}.skills`);
  group.skills.forEach((skill, i) => validateSkill(skill, `${where}.skills[${i}]`, scale));
}

function validateData(data) {
  schema.root(data);
  schema.string(data.prompt, "prompt");
  schema.string(data.title, "title");
  const { scale, groups } = data;
  if (typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0) {
    fail(ERRORS.SCHEMA, `scale (${JSON.stringify(scale)}) must be a finite number > 0`);
  }
  schema.array(groups, "groups");
  groups.forEach((group, i) => validateGroup(group, `groups[${i}]`, scale));
  return data;
}

function formatScore(score, scale) {
  return `${num(score)}/${num(scale)}`;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
function axisRange(data) {
  const { tickStep, floor } = CONFIG.axis;
  const lowest = Math.min(...data.groups.flatMap((g) => g.skills.map((s) => s.score)));
  const min = Math.max(0, Math.min(floor, Math.floor(lowest / tickStep) * tickStep));
  return { min, max: data.scale };
}

function axisTicks(range) {
  const ticks = [];
  for (let v = range.min; v < range.max; v += CONFIG.axis.tickStep) ticks.push(v);
  ticks.push(range.max);
  return ticks;
}

function plotBox() {
  const { card } = THEME;
  const left = card.padX + CONFIG.panel.axisLabelWidth;
  const right = card.width - card.padX;
  return { left, right, width: right - left };
}

function panelHeight() {
  const p = CONFIG.panel;
  return THEME.section.titleHeight + p.headroom + p.plotHeight + p.labelGap + p.labelLineHeight * (p.labelLines - 1) + p.bottomGap;
}

function makeYScale(range, plotTop) {
  const { plotHeight } = CONFIG.panel;
  return (value) => plotTop + plotHeight - ((value - range.min) / (range.max - range.min)) * plotHeight;
}

function makeXScale(count) {
  const box = plotBox();
  const slot = box.width / count;
  return { x: (i) => box.left + slot * (i + 0.5), slot };
}

// ---------------------------------------------------------------------------
// Label wrapping
// ---------------------------------------------------------------------------
function wrapLabel(text, limit) {
  if (text.length <= limit) return [text];
  const sep = text.indexOf(WRAP_SEPARATOR);
  if (sep !== -1) return [text.slice(0, sep), text.slice(sep + WRAP_SEPARATOR.length)];
  let cut = text.lastIndexOf(" ", limit);
  if (cut <= 0) cut = text.indexOf(" ");
  if (cut <= 0) return [text];
  return [text.slice(0, cut), text.slice(cut + 1)];
}

// ---------------------------------------------------------------------------
// Visual layers (one function each)
// ---------------------------------------------------------------------------
function renderDefs(groups) {
  const { areaTopOpacity, areaBottomOpacity } = CONFIG.series;
  const gradients = groups.map(
    (group, i) =>
      `    <linearGradient id="area-${i}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="${group.accent}" stop-opacity="${num(areaTopOpacity)}"/>` +
      `<stop offset="1" stop-color="${group.accent}" stop-opacity="${num(areaBottomOpacity)}"/>` +
      `</linearGradient>`,
  );
  return ["  <defs>", ...gradients, "  </defs>"];
}

function motionRules(groupCount) {
  const a = CONFIG.animation;
  const delays = [];
  for (let i = 0; i < groupCount; i++) {
    const start = i * a.panelStagger;
    delays.push(
      `.p${i} .line { animation-delay: ${num(start)}s; }`,
      `.p${i} .area { animation-delay: ${num(start + a.areaDelay)}s; }`,
      `.p${i} .marks { animation-delay: ${num(start + a.lineDuration)}s; }`,
    );
  }
  return [
    KEYFRAMES.draw,
    KEYFRAMES.fade,
    `.line { stroke-dasharray: 1 2; animation: draw ${num(a.lineDuration)}s ease-out both; }`,
    `.area { animation: fade ${num(a.areaDuration)}s ease-out both; }`,
    `.marks { animation: fade ${num(a.marksDuration)}s ease-out both; }`,
    ...delays,
  ];
}

function renderGrid(range, yScale) {
  const { colors } = THEME;
  const { font, axis, panel } = CONFIG;
  const box = plotBox();
  return axisTicks(range).flatMap((tick) => {
    const y = yScale(tick);
    return [
      `    <line ${attrs({ x1: box.left, y1: y, x2: box.right, y2: y, stroke: colors.grid, "stroke-width": axis.gridWidth })}/>`,
      `    <text ${attrs({
        x: box.left - panel.tickLabelGap,
        y,
        "font-size": font.tick,
        fill: colors.muted,
        "text-anchor": "end",
        "dominant-baseline": "middle",
      })}>${escapeXml(num(tick))}</text>`,
    ];
  });
}

function seriesPoints(group, xScale, yScale) {
  return group.skills.map((skill, i) => ({ x: xScale.x(i), y: yScale(skill.score), skill }));
}

function polyline(points) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${num(p.x)} ${num(p.y)}`).join(" ");
}

function renderArea(points, baseY, index) {
  const first = points[0];
  const last = points[points.length - 1];
  const d = `${polyline(points)} L${num(last.x)} ${num(baseY)} L${num(first.x)} ${num(baseY)} Z`;
  return [`    <path class="area" ${attrs({ d, fill: `url(#area-${index})` })}/>`];
}

function renderLine(points, accent) {
  return [
    `    <path class="line" ${attrs({
      d: polyline(points),
      pathLength: 1,
      fill: "none",
      stroke: accent,
      "stroke-width": CONFIG.series.lineWidth,
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    })}/>`,
  ];
}

function renderMarks(points, accent, scale) {
  const { colors } = THEME;
  const { font, series } = CONFIG;
  const marks = points.flatMap((p) => [
    `      <circle ${attrs({ cx: p.x, cy: p.y, r: series.dotRadius, fill: accent, stroke: colors.background, "stroke-width": series.dotRing })}/>`,
    `      <text ${attrs({
      x: p.x,
      y: p.y - series.valueOffset,
      "font-size": font.value,
      fill: colors.primary,
      "text-anchor": "middle",
    })}>${escapeXml(formatScore(p.skill.score, scale))}</text>`,
  ]);
  return ['    <g class="marks">', ...marks, "    </g>"];
}

function renderLabels(points, slot, baseY) {
  const { colors } = THEME;
  const { font, panel } = CONFIG;
  const limit = maxChars(slot - panel.slotPadding, font.label);
  return points.map((p) => {
    const lines = wrapLabel(p.skill.name, limit);
    const tspans = lines
      .map((line, i) => `<tspan ${attrs({ x: p.x, dy: i === 0 ? 0 : panel.labelLineHeight })}>${escapeXml(line)}</tspan>`)
      .join("");
    return `    <text ${attrs({
      x: p.x,
      y: baseY + panel.labelGap,
      "font-size": font.label,
      fill: colors.muted,
      "text-anchor": "middle",
    })}>${tspans}</text>`;
  });
}

function renderPanel(group, index, ctx) {
  const { panel } = CONFIG;
  const top = THEME.header.height + index * panelHeight();
  const plotTop = top + THEME.section.titleHeight + panel.headroom;
  const baseY = plotTop + panel.plotHeight;
  const yScale = makeYScale(ctx.range, plotTop);
  const xScale = makeXScale(group.skills.length);
  const points = seriesPoints(group, xScale, yScale);
  return [
    `  <g class="p${index}">`,
    ...renderSectionTitle({ title: group.name, top, accent: group.accent }),
    ...renderGrid(ctx.range, yScale),
    ...renderArea(points, baseY, index),
    ...renderLine(points, group.accent),
    ...renderMarks(points, group.accent, ctx.scale),
    ...renderLabels(points, xScale.slot, baseY),
    "  </g>",
  ];
}

// ---------------------------------------------------------------------------
// Compose and write
// ---------------------------------------------------------------------------
function describe(data) {
  return data.groups
    .map((g) => `${g.name}: ${g.skills.map((s) => `${s.name} ${formatScore(s.score, data.scale)}`).join(", ")}.`)
    .join(" ");
}

function composeSvg(data) {
  const ctx = { range: axisRange(data), scale: data.scale };
  return renderCardSvg({
    height: cardHeight(THEME.header.height + data.groups.length * panelHeight() - CONFIG.panel.bottomGap),
    title: data.title,
    desc: describe(data),
    head: [...renderStyle(motionRules(data.groups.length)), ...renderDefs(data.groups)],
    prompt: data.prompt,
    body: data.groups.flatMap((group, i) => renderPanel(group, i, ctx)),
  });
}

function main() {
  const { input, output } = CONFIG.paths;
  const data = validateData(readJson(input, ERRORS.INPUT));
  writeText(output, composeSvg(data), ERRORS.WRITE);
  const skillCount = data.groups.reduce((sum, g) => sum + g.skills.length, 0);
  logSuccess(`wrote ${repoRelative(output)} (${data.groups.length} groups, ${skillCount} skills)`);
}

run(main, ERRORS.INTERNAL);
