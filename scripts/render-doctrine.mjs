// Usage: node scripts/render-doctrine.mjs   (reads assets/doctrine.json, writes assets/doctrine.svg)

import { THEME, KEYFRAMES, num, escapeXml, attrs, textWidth, cardHeight, renderStyle, renderSectionTitle, renderCardSvg } from "./lib/card.mjs";
import { fail, logSuccess, readJson, repoPath, repoRelative, run, writeText } from "./lib/cli.mjs";
import { makeSchema } from "./lib/schema.mjs";

// ---------------------------------------------------------------------------
// Configuration: every tunable lives here (shared card look: lib/card.mjs THEME).
// ---------------------------------------------------------------------------
const CONFIG = {
  paths: {
    input: repoPath("assets", "doctrine.json"),
    output: repoPath("assets", "doctrine.svg"),
  },
  title: "Operating doctrine",
  band: {
    contentGap: 16, // title row to band content
    captionGap: 30, // band content bottom to caption baseline
    captionSize: 11,
    gap: 40, // caption baseline to the next band's top
  },
  box: {
    padX: 18,
    fitSlack: 8, // extra width on top of the text estimate; real monospace advances run slightly wide
    radius: 8,
    strokeWidth: 1,
    leadStrokeWidth: 1.5,
    roleSize: 11,
    roleLetterSpacing: 1.5,
    roleBaseline: 26, // from the box top
    nameSize: 14,
    nameGap: 22, // role baseline to name baseline
    lineSize: 12,
    firstLineGap: 22, // name baseline to first line baseline
    lineHeight: 17,
    padBottom: 18, // last baseline to the box bottom
  },
  pill: { size: 11, height: 22, padX: 10, gap: 12, padBottom: 16 },
  chain: { workerGap: 18, minColumnGap: 56 },
  wire: { width: 1.5, corner: 10, headLength: 7, headHalfWidth: 4 },
  stepper: {
    radiusBase: 14,
    radiusStep: 4, // nodes grow 01 to 04
    numberSizeBase: 11,
    numberSizeStep: 1,
    strokeWidth: 1.5,
    topPad: 4, // band content top to the largest node's top
    trackGap: 8, // node edge to track segment end
    nameGap: 26, // largest node bottom to stage name baseline
    nameSize: 13,
    lineSize: 12,
    firstLineGap: 20,
    lineHeight: 16,
    columnPad: 16, // horizontal breathing room inside each column
  },
  animation: {
    bandDuration: 0.6,
    bandStagger: 0.35,
    riseOffset: 8,
    wireDelay: 0.3,
    wireDuration: 0.6,
    headDuration: 0.25,
    nodeDelay: 0.2, // after the snowball band starts
    nodeStagger: 0.3,
    nodeDuration: 0.4,
    segmentLead: 0.2, // segment starts this long after its source node
    segmentDuration: 0.2,
  },
};

const ERRORS = {
  INPUT: "E_DOCTRINE_001",
  SCHEMA: "E_DOCTRINE_002",
  WRITE: "E_DOCTRINE_003",
  INTERNAL: "E_DOCTRINE_000",
};

const CONTENT_LEFT = THEME.card.padX;
const CONTENT_WIDTH = THEME.card.width - 2 * THEME.card.padX;
const schema = makeSchema(ERRORS.SCHEMA);

// Layout check: content estimated at `width` px must fit the `available` px.
function fits(width, available, where) {
  if (width > available) fail(ERRORS.SCHEMA, `${where} needs ${num(width)}px but only ${num(available)}px fit`);
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------
function validateLines(lines, where) {
  schema.array(lines, where);
  lines.forEach((line, i) => schema.string(line, `${where}[${i}]`));
}

function validateMember(member, where) {
  schema.object(member, where);
  schema.string(member.role, `${where}.role`);
  schema.string(member.name, `${where}.name`);
  validateLines(member.lines, `${where}.lines`);
}

function validateCommand(command) {
  schema.object(command, "command");
  schema.string(command.title, "command.title");
  schema.accent(command.accent, "command.accent");
  validateMember(command.operator, "command.operator");
  validateMember(command.lead, "command.lead");
  schema.string(command.lead.rule, "command.lead.rule");
  schema.array(command.workers, "command.workers");
  command.workers.forEach((worker, i) => validateMember(worker, `command.workers[${i}]`));
  schema.string(command.caption, "command.caption");
}

function validateSnowball(snowball) {
  schema.object(snowball, "snowball");
  schema.string(snowball.title, "snowball.title");
  schema.accent(snowball.accent, "snowball.accent");
  schema.array(snowball.stages, "snowball.stages");
  snowball.stages.forEach((stage, i) => {
    schema.object(stage, `snowball.stages[${i}]`);
    schema.string(stage.name, `snowball.stages[${i}].name`);
    validateLines(stage.lines, `snowball.stages[${i}].lines`);
  });
  schema.string(snowball.caption, "snowball.caption");
}

function validateData(data) {
  schema.root(data);
  schema.string(data.prompt, "prompt");
  validateCommand(data.command);
  validateSnowball(data.snowball);
  return data;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
function text(props, content) {
  return `<text ${attrs(props)}>${content}</text>`;
}

// One <text> per block of stacked lines, each line a tspan stepping down by lineHeight.
function renderLines({ x, y, fontSize, fill, lines, lineHeight, anchor = "start" }) {
  const tspans = lines
    .map((line, i) => `<tspan ${attrs({ x, dy: i === 0 ? 0 : lineHeight })}>${escapeXml(line)}</tspan>`)
    .join("");
  return text({ x, y, "font-size": fontSize, fill, "text-anchor": anchor }, tspans);
}

function renderCaption(caption, y) {
  return `    ${text({ x: CONTENT_LEFT, y, "font-size": CONFIG.band.captionSize, fill: THEME.colors.muted }, escapeXml(caption))}`;
}

// Horizontal run from (x0, y0) to (x1, y1) with one vertical jog at midX and rounded elbows.
function elbowPath(x0, y0, x1, y1, midX) {
  const dy = y1 - y0;
  if (dy === 0) return `M${num(x0)} ${num(y0)} H${num(x1)}`;
  const r = Math.min(CONFIG.wire.corner, Math.abs(dy) / 2, midX - x0, x1 - midX);
  const s = Math.sign(dy);
  return [
    `M${num(x0)} ${num(y0)}`,
    `H${num(midX - r)}`,
    `Q${num(midX)} ${num(y0)} ${num(midX)} ${num(y0 + s * r)}`,
    `V${num(y1 - s * r)}`,
    `Q${num(midX)} ${num(y1)} ${num(midX + r)} ${num(y1)}`,
    `H${num(x1)}`,
  ].join(" ");
}

// A wire ending under a right-pointing arrowhead whose tip touches (tipX, tipY).
function renderArrow(d, tipX, tipY, color) {
  const { width, headLength, headHalfWidth } = CONFIG.wire;
  const head = `M${num(tipX)} ${num(tipY)} L${num(tipX - headLength)} ${num(tipY - headHalfWidth)} L${num(tipX - headLength)} ${num(tipY + headHalfWidth)} Z`;
  return [
    `      <path class="wire" ${attrs({ d, pathLength: 1, fill: "none", stroke: color, "stroke-width": width, "stroke-linejoin": "round" })}/>`,
    `      <path class="head" ${attrs({ d: head, fill: color })}/>`,
  ];
}

// Wire endpoint pulled back under the arrowhead so the stroke never pokes past the tip.
function wireEnd(tipX) {
  return tipX - CONFIG.wire.headLength + 1;
}

// ---------------------------------------------------------------------------
// Band 1: chain of command
// ---------------------------------------------------------------------------
function memberContentWidth(member) {
  const { box, pill } = CONFIG;
  const widths = [
    textWidth(member.role, box.roleSize, box.roleLetterSpacing),
    textWidth(member.name, box.nameSize),
    ...member.lines.map((line) => textWidth(line, box.lineSize)),
  ];
  if (member.rule) widths.push(textWidth(member.rule, pill.size) + 2 * pill.padX);
  return Math.ceil(Math.max(...widths)) + 2 * box.padX + box.fitSlack;
}

function lastLineOffset(member) {
  const { box } = CONFIG;
  return box.roleBaseline + box.nameGap + box.firstLineGap + (member.lines.length - 1) * box.lineHeight;
}

function memberHeight(member) {
  const { box, pill } = CONFIG;
  const textBottom = lastLineOffset(member);
  if (!member.rule) return textBottom + box.padBottom;
  return textBottom + pill.gap + pill.height + pill.padBottom;
}

function layoutChain(command, contentTop) {
  const { chain } = CONFIG;
  const { operator, lead, workers } = command;
  const widths = {
    operator: memberContentWidth(operator),
    lead: memberContentWidth(lead),
    worker: Math.max(...workers.map(memberContentWidth)),
  };
  const workerHeight = Math.max(...workers.map(memberHeight));
  const stackHeight = workers.length * workerHeight + (workers.length - 1) * chain.workerGap;
  const height = Math.max(stackHeight, memberHeight(operator), memberHeight(lead));
  const columnGap = (CONTENT_WIDTH - widths.operator - widths.lead - widths.worker) / 2;
  fits(chain.minColumnGap, columnGap, "command boxes (column gap)");
  const centreY = contentTop + height / 2;
  const centred = (member, x, width) => ({ member, x, width, y: centreY - memberHeight(member) / 2, height: memberHeight(member) });
  const leadX = CONTENT_LEFT + widths.operator + columnGap;
  const workerX = leadX + widths.lead + columnGap;
  const stackTop = centreY - stackHeight / 2;
  return {
    operator: centred(operator, CONTENT_LEFT, widths.operator),
    lead: centred(lead, leadX, widths.lead),
    workers: workers.map((member, i) => ({
      member,
      x: workerX,
      width: widths.worker,
      y: stackTop + i * (workerHeight + chain.workerGap),
      height: workerHeight,
    })),
    centreY,
    columnGap,
    bottom: contentTop + height,
  };
}

function renderPill(rule, rect, accent) {
  const { box, pill } = CONFIG;
  const x = rect.x + box.padX;
  const y = rect.y + rect.height - pill.padBottom - pill.height;
  const width = textWidth(rule, pill.size) + 2 * pill.padX;
  return [
    `      <rect ${attrs({ x, y, width, height: pill.height, rx: pill.height / 2, fill: accent, "fill-opacity": 0.14 })}/>`,
    `      ${text(
      { x: x + width / 2, y: y + pill.height / 2, "font-size": pill.size, fill: accent, "text-anchor": "middle", "dominant-baseline": "central" },
      escapeXml(rule),
    )}`,
  ];
}

// Every box (operator, lead, workers) is drawn here; the lead differs only by its stroke and pill.
function renderMemberBox(rect, accent, isLead) {
  const { colors } = THEME;
  const { box } = CONFIG;
  const { member } = rect;
  const x = rect.x + box.padX;
  const roleY = rect.y + box.roleBaseline;
  const nameY = roleY + box.nameGap;
  return [
    `      <rect ${attrs({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      rx: box.radius,
      fill: colors.surface,
      stroke: isLead ? accent : colors.border,
      "stroke-width": isLead ? box.leadStrokeWidth : box.strokeWidth,
    })}/>`,
    `      ${text(
      { x, y: roleY, "font-size": box.roleSize, "font-weight": "bold", "letter-spacing": box.roleLetterSpacing, fill: accent },
      escapeXml(member.role.toUpperCase()),
    )}`,
    `      ${text({ x, y: nameY, "font-size": box.nameSize, "font-weight": "bold", fill: colors.primary }, escapeXml(member.name))}`,
    `      ${renderLines({ x, y: nameY + box.firstLineGap, fontSize: box.lineSize, fill: colors.muted, lines: member.lines, lineHeight: box.lineHeight })}`,
    ...(isLead ? renderPill(member.rule, rect, accent) : []),
  ];
}

function renderChainWires(layout) {
  const color = THEME.colors.connector;
  const { operator, lead, workers, centreY, columnGap } = layout;
  const leadRight = lead.x + lead.width;
  const forkX = leadRight + columnGap / 2;
  const toLead = renderArrow(elbowPath(operator.x + operator.width, centreY, wireEnd(lead.x), centreY, 0), lead.x, centreY, color);
  const toWorkers = workers.flatMap((w) => {
    const y = w.y + w.height / 2;
    return renderArrow(elbowPath(leadRight, centreY, wireEnd(w.x), y, forkX), w.x, y, color);
  });
  return ["    <g>", ...toLead, ...toWorkers, "    </g>"];
}

function renderChainBand(command, top) {
  const { band } = CONFIG;
  const layout = layoutChain(command, top + THEME.section.titleHeight + band.contentGap);
  const boxes = [layout.operator, layout.lead, ...layout.workers];
  const captionY = layout.bottom + band.captionGap;
  return {
    svg: [
      ...renderSectionTitle({ title: command.title, top, accent: command.accent }),
      ...renderChainWires(layout),
      ...boxes.flatMap((rect) => ["    <g>", ...renderMemberBox(rect, command.accent, rect === layout.lead), "    </g>"]),
      renderCaption(command.caption, captionY),
    ],
    bottom: captionY,
  };
}

// ---------------------------------------------------------------------------
// Band 2: the tight snowball (stepper)
// ---------------------------------------------------------------------------
function nodeRadius(i) {
  return CONFIG.stepper.radiusBase + i * CONFIG.stepper.radiusStep;
}

function stepNumber(i) {
  return String(i + 1).padStart(2, "0");
}

function checkStageFit(stage, i, slot) {
  const { stepper } = CONFIG;
  const width = Math.max(textWidth(stage.name, stepper.nameSize), ...stage.lines.map((line) => textWidth(line, stepper.lineSize)));
  fits(width, slot - stepper.columnPad, `snowball.stages[${i}]`);
}

function renderNode(i, cx, cy, accent) {
  const { colors } = THEME;
  const { stepper } = CONFIG;
  return [
    `    <g class="node n${i}">`,
    `      <circle ${attrs({ cx, cy, r: nodeRadius(i), fill: colors.background, stroke: accent, "stroke-width": stepper.strokeWidth })}/>`,
    `      ${text(
      { x: cx, y: cy, "font-size": stepper.numberSizeBase + i * stepper.numberSizeStep, "font-weight": "bold", fill: accent, "text-anchor": "middle", "dominant-baseline": "central" },
      stepNumber(i),
    )}`,
    "    </g>",
  ];
}

function renderSegment(i, fromX, toX, y, accent) {
  const start = fromX + nodeRadius(i) + CONFIG.stepper.trackGap;
  const tip = toX - nodeRadius(i + 1) - CONFIG.stepper.trackGap;
  return [`    <g class="s${i}">`, ...renderArrow(elbowPath(start, y, wireEnd(tip), y, 0), tip, y, accent), "    </g>"];
}

function renderStageText(stage, cx, nameY) {
  const { colors } = THEME;
  const { stepper } = CONFIG;
  return [
    `    ${text({ x: cx, y: nameY, "font-size": stepper.nameSize, "font-weight": "bold", fill: colors.primary, "text-anchor": "middle" }, escapeXml(stage.name))}`,
    `    ${renderLines({ x: cx, y: nameY + stepper.firstLineGap, fontSize: stepper.lineSize, fill: colors.muted, lines: stage.lines, lineHeight: stepper.lineHeight, anchor: "middle" })}`,
  ];
}

function renderSnowballBand(snowball, top) {
  const { band, stepper } = CONFIG;
  const { stages, accent } = snowball;
  const slot = CONTENT_WIDTH / stages.length;
  stages.forEach((stage, i) => checkStageFit(stage, i, slot));
  const maxRadius = nodeRadius(stages.length - 1);
  const trackY = top + THEME.section.titleHeight + band.contentGap + stepper.topPad + maxRadius;
  const nameY = trackY + maxRadius + stepper.nameGap;
  const centres = stages.map((_, i) => CONTENT_LEFT + slot * (i + 0.5));
  const tallest = Math.max(...stages.map((s) => s.lines.length));
  const captionY = nameY + stepper.firstLineGap + (tallest - 1) * stepper.lineHeight + band.captionGap;
  return {
    svg: [
      ...renderSectionTitle({ title: snowball.title, top, accent }),
      ...centres.slice(0, -1).flatMap((cx, i) => renderSegment(i, cx, centres[i + 1], trackY, accent)),
      ...centres.flatMap((cx, i) => renderNode(i, cx, trackY, accent)),
      ...stages.flatMap((stage, i) => renderStageText(stage, centres[i], nameY)),
      renderCaption(snowball.caption, captionY),
    ],
    bottom: captionY,
  };
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------
function rule(selector, body) {
  return `${selector} { ${body} }`;
}

function delay(seconds) {
  return `animation-delay: ${num(seconds)}s;`;
}

function motionRules(bandCount, stageCount) {
  const a = CONFIG.animation;
  const snowballStart = a.bandStagger;
  const nodeStart = (i) => snowballStart + a.nodeDelay + i * a.nodeStagger;
  const rules = [
    KEYFRAMES.draw,
    KEYFRAMES.fade,
    `@keyframes rise { from { opacity: 0; transform: translateY(${num(a.riseOffset)}px); } to { opacity: 1; transform: translateY(0); } }`,
    "@keyframes pop { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; transform: scale(1); } }",
    rule(".band", `animation: rise ${num(a.bandDuration)}s ease-out both;`),
    rule(".wire", `stroke-dasharray: 1 2; animation: draw ${num(a.wireDuration)}s ease-out both;`),
    rule(".head", `animation: fade ${num(a.headDuration)}s ease-out both;`),
    rule(".node", `transform-box: fill-box; transform-origin: center; animation: pop ${num(a.nodeDuration)}s ease-out both;`),
    rule(".b0 .wire", delay(a.wireDelay)),
    rule(".b0 .head", delay(a.wireDelay + a.wireDuration)),
  ];
  for (let i = 0; i < bandCount; i++) rules.push(rule(`.b${i}`, delay(i * a.bandStagger)));
  for (let i = 0; i < stageCount; i++) rules.push(rule(`.n${i}`, delay(nodeStart(i))));
  for (let i = 0; i < stageCount - 1; i++) {
    const start = nodeStart(i) + a.segmentLead;
    rules.push(
      rule(`.s${i} .wire`, `animation-duration: ${num(a.segmentDuration)}s; ${delay(start)}`),
      rule(`.s${i} .head`, delay(start + a.segmentDuration)),
    );
  }
  return rules;
}

// ---------------------------------------------------------------------------
// Compose and write
// ---------------------------------------------------------------------------
function describe(data) {
  const { command, snowball } = data;
  const member = (m) => `${m.role} ${m.name}: ${m.lines.join(" ")}`;
  return [
    `${command.title}. ${member(command.operator)}. ${member(command.lead)}; ${command.lead.rule}.`,
    ...command.workers.map((w) => `${member(w)}.`),
    command.caption,
    `${snowball.title}: ${snowball.stages.map((s, i) => `${stepNumber(i)} ${s.name} (${s.lines.join(" ")})`).join(", ")}.`,
    snowball.caption,
  ].join(" ");
}

function composeSvg(data) {
  const bands = [
    (top) => renderChainBand(data.command, top),
    (top) => renderSnowballBand(data.snowball, top),
  ];
  const body = [];
  let top = THEME.header.height;
  let bottom = top;
  bands.forEach((renderBand, i) => {
    const band = renderBand(top);
    body.push(`  <g class="band b${i}">`, ...band.svg, "  </g>");
    bottom = band.bottom;
    top = bottom + CONFIG.band.gap;
  });
  return renderCardSvg({
    height: cardHeight(bottom),
    title: CONFIG.title,
    desc: describe(data),
    head: renderStyle(motionRules(bands.length, data.snowball.stages.length)),
    prompt: data.prompt,
    body,
  });
}

function main() {
  const { input, output } = CONFIG.paths;
  const data = validateData(readJson(input, ERRORS.INPUT));
  writeText(output, composeSvg(data), ERRORS.WRITE);
  logSuccess(`wrote ${repoRelative(output)}`);
}

run(main, ERRORS.INTERNAL);
