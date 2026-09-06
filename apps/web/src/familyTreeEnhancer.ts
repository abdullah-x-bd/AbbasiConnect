type TreePerson = {
  id: string;
  name: string;
  meta: string;
  guest: boolean;
  generation: number;
};

type TreeEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: "parent" | "child" | "sibling" | "spouse" | "other";
};

type Point = { x: number; y: number };

const SVG_NS = "http://www.w3.org/2000/svg";

function relationKind(label: string): TreeEdge["kind"] {
  const value = label.toLowerCase();
  if (/parent|father|mother|dad|mom|abu|ammi/.test(value)) return "parent";
  if (/child|son|daughter/.test(value)) return "child";
  if (/sibling|brother|sister/.test(value)) return "sibling";
  if (/spouse|husband|wife/.test(value)) return "spouse";
  return "other";
}

function cleanRelation(value: string) {
  return value.replace(/[—→←]/g, " ").replace(/\s+/g, " ").trim();
}

function svgElement<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}) {
  const el = document.createElementNS(SVG_NS, name);
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
  return el;
}

function drawPath(svg: SVGSVGElement, d: string, className: string) {
  const path = svgElement("path", { d, fill: "none" });
  path.setAttribute("class", className);
  svg.appendChild(path);
}

function drawLine(svg: SVGSVGElement, x1: number, y1: number, x2: number, y2: number, className: string) {
  const line = svgElement("line", { x1, y1, x2, y2 });
  line.setAttribute("class", className);
  svg.appendChild(line);
}

function siblingComponents(edges: TreeEdge[], people: Map<string, TreePerson>) {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges.filter((edge) => edge.kind === "sibling")) {
    if (!people.has(edge.from) || !people.has(edge.to)) continue;
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Set());
    adjacency.get(edge.from)!.add(edge.to);
    adjacency.get(edge.to)!.add(edge.from);
  }

  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const id of adjacency.keys()) {
    if (seen.has(id)) continue;
    const queue = [id];
    const group: string[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      if (seen.has(current)) continue;
      seen.add(current);
      group.push(current);
      for (const next of adjacency.get(current) ?? []) if (!seen.has(next)) queue.push(next);
    }
    if (group.length > 1) groups.push(group);
  }
  return groups;
}

function inferGenerations(people: TreePerson[], edges: TreeEdge[], rootId: string) {
  const generations = new Map<string, number>([[rootId, 0]]);

  for (let pass = 0; pass < people.length * 3; pass += 1) {
    let changed = false;
    for (const edge of edges) {
      const delta = edge.kind === "parent" ? -1 : edge.kind === "child" ? 1 : 0;
      const from = generations.get(edge.from);
      const to = generations.get(edge.to);
      if (from !== undefined && to === undefined) {
        generations.set(edge.to, from + delta);
        changed = true;
      } else if (to !== undefined && from === undefined) {
        generations.set(edge.from, to - delta);
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (const person of people) person.generation = generations.get(person.id) ?? 0;
}

function enhancePanel(panel: HTMLElement) {
  const originalNodes = panel.querySelector<HTMLElement>(".tree-nodes");
  const originalEdges = panel.querySelector<HTMLElement>(".edge-list");
  if (!originalNodes || !originalEdges) return;

  const signature = `${originalNodes.textContent ?? ""}::${originalEdges.textContent ?? ""}`;
  if (panel.dataset.genealogySignature === signature && panel.querySelector(".genealogy-canvas")) return;
  panel.dataset.genealogySignature = signature;
  panel.querySelector(".genealogy-canvas")?.remove();

  const personElements = Array.from(originalNodes.querySelectorAll<HTMLElement>(".tree-node"));
  if (!personElements.length) return;

  const people: TreePerson[] = personElements.map((element, index) => ({
    id: `p${index}`,
    name: element.querySelector("strong")?.textContent?.trim() || `Person ${index + 1}`,
    meta: element.querySelector("small")?.textContent?.trim() || "",
    guest: element.classList.contains("guest"),
    generation: 0,
  }));

  const idsByName = new Map<string, string[]>();
  for (const person of people) idsByName.set(person.name, [...(idsByName.get(person.name) ?? []), person.id]);
  const firstId = (name: string) => idsByName.get(name)?.[0];

  const edges: TreeEdge[] = Array.from(originalEdges.children).flatMap((element, index) => {
    const spans = element.querySelectorAll("span");
    const relation = cleanRelation(element.querySelector("b")?.textContent || "Related");
    const from = firstId(spans[0]?.textContent?.trim() || "");
    const to = firstId(spans[1]?.textContent?.trim() || "");
    if (!from || !to) return [];
    return [{ id: `e${index}`, from, to, label: relation, kind: relationKind(relation) }];
  });

  const rootId = people[0].id;
  inferGenerations(people, edges, rootId);
  const peopleById = new Map(people.map((person) => [person.id, person]));

  const generations = Array.from(new Set(people.map((person) => person.generation))).sort((a, b) => a - b);
  const rows = generations.map((generation) => ({
    generation,
    people: people.filter((person) => person.generation === generation),
  }));

  const nodeWidth = 190;
  const nodeHeight = 84;
  const columnGap = 74;
  const rowGap = 190;
  const horizontalPadding = 80;
  const verticalPadding = 72;
  const maxAcross = Math.max(...rows.map((row) => row.people.length), 1);
  const width = Math.max(760, horizontalPadding * 2 + maxAcross * nodeWidth + Math.max(0, maxAcross - 1) * columnGap);
  const height = verticalPadding * 2 + rows.length * nodeHeight + Math.max(0, rows.length - 1) * (rowGap - nodeHeight) + 52;

  const positions = new Map<string, Point>();
  rows.forEach((row, rowIndex) => {
    const rowWidth = row.people.length * nodeWidth + Math.max(0, row.people.length - 1) * columnGap;
    const startX = (width - rowWidth) / 2;
    const y = verticalPadding + rowIndex * rowGap;
    row.people.forEach((person, columnIndex) => {
      positions.set(person.id, { x: startX + columnIndex * (nodeWidth + columnGap), y });
    });
  });

  const canvas = document.createElement("div");
  canvas.className = "genealogy-canvas";
  const scroll = document.createElement("div");
  scroll.className = "genealogy-scroll";
  const stage = document.createElement("div");
  stage.className = "genealogy-stage";
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;

  const svg = svgElement("svg", { width, height, viewBox: `0 0 ${width} ${height}` });
  svg.setAttribute("class", "genealogy-lines");
  stage.appendChild(svg);

  const siblingEdgeIds = new Set(edges.filter((edge) => edge.kind === "sibling").map((edge) => edge.id));
  const groups = siblingComponents(edges, peopleById);

  for (const group of groups) {
    const groupPositions = group.map((id) => ({ id, point: positions.get(id)! })).filter((item) => item.point);
    if (groupPositions.length < 2) continue;
    const topY = Math.min(...groupPositions.map(({ point }) => point.y));
    const anchorY = topY - 34;
    const centers = groupPositions.map(({ point }) => point.x + nodeWidth / 2);
    const minX = Math.min(...centers);
    const maxX = Math.max(...centers);
    drawLine(svg, minX, anchorY, maxX, anchorY, "genealogy-line sibling-line");
    for (const { point } of groupPositions) {
      drawLine(svg, point.x + nodeWidth / 2, anchorY, point.x + nodeWidth / 2, point.y, "genealogy-line sibling-line");
    }
    const text = svgElement("text", { x: (minX + maxX) / 2, y: anchorY - 9, "text-anchor": "middle" });
    text.setAttribute("class", "genealogy-label");
    text.textContent = "siblings";
    svg.appendChild(text);
  }

  for (const edge of edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to || siblingEdgeIds.has(edge.id)) continue;

    if (edge.kind === "spouse") {
      const left = from.x < to.x ? from : to;
      const right = from.x < to.x ? to : from;
      const y = left.y + nodeHeight / 2;
      drawLine(svg, left.x + nodeWidth, y, right.x, y, "genealogy-line spouse-line");
      const text = svgElement("text", { x: (left.x + nodeWidth + right.x) / 2, y: y - 9, "text-anchor": "middle" });
      text.setAttribute("class", "genealogy-label");
      text.textContent = edge.label || "spouse";
      svg.appendChild(text);
      continue;
    }

    if (edge.kind === "parent" || edge.kind === "child") {
      const parent = edge.kind === "parent" ? to : from;
      const child = edge.kind === "parent" ? from : to;
      const parentBottom = { x: parent.x + nodeWidth / 2, y: parent.y + nodeHeight };
      const childTop = { x: child.x + nodeWidth / 2, y: child.y };
      const midY = (parentBottom.y + childTop.y) / 2;
      drawPath(svg, `M ${parentBottom.x} ${parentBottom.y} V ${midY} H ${childTop.x} V ${childTop.y}`, "genealogy-line descent-line");
      continue;
    }

    const fromCenter = { x: from.x + nodeWidth / 2, y: from.y + nodeHeight / 2 };
    const toCenter = { x: to.x + nodeWidth / 2, y: to.y + nodeHeight / 2 };
    drawLine(svg, fromCenter.x, fromCenter.y, toCenter.x, toCenter.y, "genealogy-line other-line");
  }

  for (const person of people) {
    const point = positions.get(person.id)!;
    const card = document.createElement("button");
    card.type = "button";
    card.className = `genealogy-person${person.id === rootId ? " root-person" : ""}${person.guest ? " guest-person" : ""}`;
    card.style.left = `${point.x}px`;
    card.style.top = `${point.y}px`;
    card.style.width = `${nodeWidth}px`;
    card.style.height = `${nodeHeight}px`;

    const name = document.createElement("strong");
    name.textContent = person.name;
    card.appendChild(name);

    const meta = document.createElement("small");
    meta.textContent = person.meta || (person.guest ? "Not registered" : "Registered member");
    card.appendChild(meta);

    if (person.id === rootId) {
      const badge = document.createElement("span");
      badge.className = "you-badge";
      badge.textContent = "You";
      card.appendChild(badge);
    }

    card.addEventListener("click", () => {
      stage.querySelectorAll(".genealogy-person.selected").forEach((item) => item.classList.remove("selected"));
      card.classList.add("selected");
    });
    stage.appendChild(card);
  }

  scroll.appendChild(stage);
  canvas.appendChild(scroll);

  const legend = document.createElement("div");
  legend.className = "genealogy-legend";
  const legendItems = [
    ["legend-branch", "siblings"],
    ["legend-vertical", "parent / child"],
    ["legend-spouse", "spouses"],
  ];
  for (const [lineClass, label] of legendItems) {
    const item = document.createElement("span");
    const marker = document.createElement("i");
    marker.className = lineClass;
    item.appendChild(marker);
    item.append(document.createTextNode(label));
    legend.appendChild(item);
  }
  canvas.appendChild(legend);

  panel.classList.add("genealogy-enhanced");
  originalNodes.before(canvas);
}

function enhanceAllTrees() {
  document.querySelectorAll<HTMLElement>(".tree-panel").forEach(enhancePanel);
}

export function installFamilyTreeEnhancer() {
  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(enhanceAllTrees, 20);
  };

  schedule();
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
}
