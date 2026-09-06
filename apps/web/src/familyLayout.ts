export type TreePerson = { id: string; displayName: string; username?: string; registered: boolean };
export type TreeEdge = { id: string; from: string; to: string; relation: string; relationLabel?: string; status: string };
export type TreeData = { rootId: string; nodes: TreePerson[]; edges: TreeEdge[] };
export const NODE_WIDTH = 208;
export const NODE_HEIGHT = 90;
const COLUMN = 260;
const ROW = 210;
const PADDING = 64;

/** Generation constraints use relationship types and IDs, never display names or custom labels. */
export function layoutFamily(tree: TreeData) {
  const people = new Map(tree.nodes.map(node => [node.id, node]));
  const adjacent = new Map(tree.nodes.map(node => [node.id, [] as { id: string; delta: number }[]]));
  const deltaFor = (relation: string) => relation === "PARENT" ? -1 : relation === "CHILD" ? 1 : 0;
  for (const edge of tree.edges) {
    if (!people.has(edge.from) || !people.has(edge.to) || !["PARENT", "CHILD", "SIBLING", "SPOUSE"].includes(edge.relation)) continue;
    const delta = deltaFor(edge.relation);
    adjacent.get(edge.from)!.push({ id: edge.to, delta });
    adjacent.get(edge.to)!.push({ id: edge.from, delta: -delta });
  }
  const generation = new Map<string, number>();
  const order: string[] = [];
  const roots = [tree.rootId, ...tree.nodes.map(node => node.id)];
  for (const root of roots) {
    if (!people.has(root) || generation.has(root)) continue;
    generation.set(root, 0);
    const queue = [root];
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index];
      order.push(id);
      for (const neighbor of adjacent.get(id)!) {
        if (generation.has(neighbor.id)) continue;
        generation.set(neighbor.id, generation.get(id)! + neighbor.delta);
        queue.push(neighbor.id);
      }
    }
  }
  const rows = new Map<number, string[]>();
  for (const id of order) {
    const level = generation.get(id)!;
    if (!rows.has(level)) rows.set(level, []);
    rows.get(level)!.push(id);
  }
  const levels = [...rows.keys()].sort((a, b) => a - b);
  const widest = Math.max(1, ...[...rows.values()].map(row => row.length));
  const width = Math.max(680, widest * COLUMN - (COLUMN - NODE_WIDTH) + PADDING * 2);
  const height = Math.max(330, Math.max(0, levels.length - 1) * ROW + NODE_HEIGHT + PADDING * 2);
  const positions = new Map<string, { x: number; y: number }>();
  levels.forEach((level, rowIndex) => {
    const row = rows.get(level)!;
    const rowWidth = row.length * COLUMN - (COLUMN - NODE_WIDTH);
    row.forEach((id, index) => positions.set(id, { x: (width - rowWidth) / 2 + index * COLUMN, y: PADDING + rowIndex * ROW }));
  });
  const edges = tree.edges.filter(edge => positions.has(edge.from) && positions.has(edge.to)).map((edge, index) => {
    const from = positions.get(edge.from)!;
    const to = positions.get(edge.to)!;
    const recognized = ["PARENT", "CHILD", "SIBLING", "SPOUSE"].includes(edge.relation);
    const consistent = recognized && generation.get(edge.to)! - generation.get(edge.from)! === deltaFor(edge.relation);
    let path: string;
    let labelX: number;
    let labelY: number;
    const fromX = from.x + NODE_WIDTH / 2;
    const toX = to.x + NODE_WIDTH / 2;
    if (from.y !== to.y) {
      const downward = from.y < to.y;
      const startY = from.y + (downward ? NODE_HEIGHT : 0);
      const endY = to.y + (downward ? 0 : NODE_HEIGHT);
      const middleY = (startY + endY) / 2 + (index % 3 - 1) * 8;
      path = `M${fromX},${startY} V${middleY} H${toX} V${endY}`;
      labelX = (fromX + toX) / 2;
      labelY = middleY - 8;
    } else {
      // Route peers above the row, so links never pass through intervening people.
      const middleY = from.y - 24 - (index % 3) * 12;
      path = `M${fromX},${from.y} V${middleY} H${toX} V${to.y}`;
      labelX = (fromX + toX) / 2;
      labelY = middleY - 7;
    }
    return { ...edge, path, labelX, labelY, neutral: !consistent };
  });
  return { width, height, positions, edges };
}
