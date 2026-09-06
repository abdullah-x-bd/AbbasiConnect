import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { layoutFamily, NODE_HEIGHT, NODE_WIDTH, type TreeData } from "./familyLayout";
import { Avatar, EmptyState, Icon } from "./ui";

const relationName = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());

export default function FamilyTree({ tree, memberId }: { tree: TreeData; memberId: string }) {
  const layout = useMemo(() => layoutFamily(tree), [tree]);
  const [selected, setSelected] = useState(tree.rootId);
  const scroller = useRef<HTMLDivElement>(null);
  const initialRoot = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!scroller.current || initialRoot.current === tree.rootId) return;
    const root = layout.positions.get(tree.rootId);
    if (root) {
      scroller.current.scrollLeft = root.x + NODE_WIDTH / 2 - scroller.current.clientWidth / 2;
      scroller.current.scrollTop = Math.max(0, root.y + NODE_HEIGHT + 64 - scroller.current.clientHeight);
    }
    initialRoot.current = tree.rootId;
    setSelected(tree.rootId);
  }, [layout, tree.rootId]);

  if (!tree.nodes.length) return <EmptyState icon="family" title="Your family starts here">Add a relative below to start your tree.</EmptyState>;
  const names = new Map(tree.nodes.map(node => [node.id, node.displayName]));
  const selectedName = names.get(selected);
  return <>
    <div className="tree-viewport" ref={scroller} tabIndex={0} role="region" aria-label="Family tree. Scroll to explore; use Tab to select people.">
      <div className="family-canvas" style={{ width: layout.width, height: layout.height }}>
        <svg className="family-connectors" width={layout.width} height={layout.height} aria-hidden="true">
          {layout.edges.map(edge => <g key={edge.id} className={`${edge.from === selected || edge.to === selected ? "is-connected" : ""} ${edge.neutral ? "is-neutral" : ""}`}>
            <path d={edge.path}/>
            <text x={edge.labelX} y={edge.labelY} textAnchor="middle">{relationName(edge.relation)}</text>
          </g>)}
        </svg>
        {tree.nodes.map(node => {
          const position = layout.positions.get(node.id)!;
          return <button type="button" key={node.id} className={`family-person${selected === node.id ? " selected" : ""}${!node.registered ? " invited" : ""}`} style={{ left: position.x, top: position.y, width: NODE_WIDTH, minHeight: NODE_HEIGHT }} onClick={() => setSelected(node.id)} aria-pressed={selected === node.id}>
            <Avatar name={node.displayName}/><span className="family-person-copy"><strong title={node.displayName}>{node.displayName}</strong><small>{node.registered ? `@${node.username || ""}` : "Not registered"}</small></span>
            {node.id === memberId && <span className="person-badge">You</span>}
            {node.id !== memberId && node.id === tree.rootId && <span className="person-badge">Tree owner</span>}
          </button>;
        })}
      </div>
    </div>
    <div className="tree-caption"><span><Icon name="family"/> Scroll to explore your connections</span><span className="tree-legend"><i/> Registered <i className="invited-key"/> Invited</span></div>
    <details className="tree-relationships"><summary>Relationships <span className="count-badge">{tree.edges.length}</span></summary><div className="relationship-list">{tree.edges.map(edge => <p key={edge.id} className={edge.from === selected || edge.to === selected ? "selected" : ""}><strong>{names.get(edge.from) || "Member"}</strong><span><Icon name="arrow"/> {relationName(edge.relationLabel || edge.relation)} <Icon name="arrow"/></span><strong>{names.get(edge.to) || "Member"}</strong><small>{relationName(edge.status)}</small></p>)}{!tree.edges.length && <p>No family relationships added yet.</p>}</div></details>
    <span className="sr-only" role="status">{selectedName ? `${selectedName} selected` : ""}</span>
  </>;
}
