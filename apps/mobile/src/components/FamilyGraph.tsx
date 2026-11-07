import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { C, s } from "../ui";
import type { FamilyTree } from "../types";

type Point = { x: number; y: number };
function layout(tree: FamilyTree) {
  const neighbors = new Map(tree.nodes.map(n => [n.id, [] as string[]]));
  for (const edge of tree.edges) {
    neighbors.get(edge.from)?.push(edge.to);
    neighbors.get(edge.to)?.push(edge.from);
  }
  const depth = new Map<string, number>([[tree.rootId, 0]]);
  const queue = [tree.rootId];
  for (let i = 0; i < queue.length; i++) {
    for (const id of neighbors.get(queue[i]) || []) {
      if (!depth.has(id)) { depth.set(id, (depth.get(queue[i]) || 0) + 1); queue.push(id); }
    }
  }
  const maxDepth = Math.max(0, ...depth.values());
  for (const n of tree.nodes) if (!depth.has(n.id)) depth.set(n.id, maxDepth + 1);
  const columns = new Map<number, string[]>();
  for (const n of tree.nodes) {
    const level = depth.get(n.id) || 0;
    columns.set(level, [...(columns.get(level) || []), n.id]);
  }
  const points = new Map<string, Point>();
  let maxRows = 1;
  for (const [column, ids] of columns) {
    maxRows = Math.max(maxRows, ids.length);
    ids.forEach((id, i) => points.set(id, { x: 18 + 208 * column, y: 18 + 93 * i }));
  }
  return { points, width: (Math.max(0, ...columns.keys()) + 1) * 208 + 20, height: maxRows * 93 + 15 };
}
export default function FamilyGraph({ tree }: { tree: FamilyTree }) {
  const data = useMemo(() => layout(tree), [tree]);
  return <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
    <ScrollView horizontal nestedScrollEnabled>
      <ScrollView nestedScrollEnabled style={{ maxHeight: 400 }}>
        <View style={{ width: data.width, height: data.height, backgroundColor: "#fafcfb" }}>
          {tree.edges.map(edge => {
            const a = data.points.get(edge.from), b = data.points.get(edge.to);
            if (!a || !b) return null;
            const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
            return <View key={edge.id} style={{ position: "absolute", left: (a.x + b.x + 184 - length) / 2, top: (a.y + b.y + 64) / 2, width: length, height: 2, backgroundColor: edge.status === "VERIFIED" ? C.teal : C.gold, transform: [{ rotate: Math.atan2(dy, dx) * 180 / Math.PI + "deg" }] }}/>;
          })}
          {tree.nodes.map(node => {
            const p = data.points.get(node.id);
            return p ? <View key={node.id} style={{ position: "absolute", left: p.x, top: p.y, width: 184, height: 68, backgroundColor: node.id === tree.rootId ? C.mint : C.white, borderWidth: 1, borderColor: node.id === tree.rootId ? C.teal : C.border, borderRadius: 11, padding: 9, justifyContent: "center" }}>
              <Text numberOfLines={1} style={{ color: C.navy, fontSize: 13, fontWeight: "800" }}>{node.displayName}</Text>
              <Text numberOfLines={1} style={s.subtle}>{node.registered === false ? "Invited relative" : node.username ? "@" + node.username : "Family member"}</Text>
            </View> : null;
          })}
        </View>
      </ScrollView>
    </ScrollView>
    <Text style={[s.subtle, { padding: 9 }]}>Scroll to explore connections. Teal links are claimed; gold links are pending.</Text>
  </View>;
}
