import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutFamily, NODE_HEIGHT, NODE_WIDTH } from '../src/familyLayout.ts';

const person = (id, displayName = id, registered = true) => ({ id, displayName, registered, username: registered ? id : undefined });
const edge = (id, from, to, relation, relationLabel = '') => ({ id, from, to, relation, relationLabel, status: 'VERIFIED' });
const tree = (nodes, edges = [], rootId = nodes[0]?.id ?? '') => ({ rootId, nodes, edges });

test('places parents above the owner and children below, using relation type even when custom labels differ', () => {
  const result = layoutFamily(tree([person('self'), person('parent'), person('child')], [edge('p', 'self', 'parent', 'PARENT', 'والد'), edge('c', 'self', 'child', 'CHILD', 'Parent is a custom nickname')]));
  assert.ok(result.positions.get('parent').y < result.positions.get('self').y);
  assert.ok(result.positions.get('child').y > result.positions.get('self').y);
  assert.ok(result.edges.every(item => !item.neutral));
});

test('keeps duplicate names as separate people and preserves invited relatives', () => {
  const result = layoutFamily(tree([person('self', 'Ali Abbasi'), person('relative', 'Ali Abbasi'), person('guest:1', 'Ali Abbasi', false)], [edge('one', 'self', 'relative', 'SIBLING'), edge('two', 'self', 'guest:1', 'CHILD')]));
  assert.equal(result.positions.size, 3);
  assert.equal(result.edges.length, 2);
  assert.notDeepEqual(result.positions.get('self'), result.positions.get('relative'));
  assert.ok(result.positions.has('guest:1'));
});

test('places spouses and siblings at the same generation without creating a parent', () => {
  const result = layoutFamily(tree([person('a'), person('b'), person('c')], [edge('spouse', 'a', 'b', 'SPOUSE'), edge('sibling', 'a', 'c', 'SIBLING')]));
  assert.equal(new Set([...result.positions.values()].map(position => position.y)).size, 1);
  assert.equal(result.positions.size, 3);
  assert.equal(result.edges.length, 2);
});

test('uses the returned root ID when it is not the first person', () => {
  const result = layoutFamily(tree([person('first'), person('owner'), person('child')], [edge('p', 'owner', 'first', 'PARENT'), edge('c', 'owner', 'child', 'CHILD')], 'owner'));
  assert.ok(result.positions.get('first').y < result.positions.get('owner').y);
  assert.ok(result.positions.get('owner').y < result.positions.get('child').y);
});

test('terminates on contradictory cycles and marks conflicting edges as neutral', () => {
  const result = layoutFamily(tree([person('a'), person('b'), person('c')], [edge('ab', 'a', 'b', 'PARENT'), edge('bc', 'b', 'c', 'PARENT'), edge('ca', 'c', 'a', 'PARENT')]));
  assert.equal(result.positions.size, 3);
  assert.equal(result.edges.length, 3);
  assert.ok(result.edges.some(item => item.neutral));
});

test('keeps disconnected people and unknown relations without guessing a generation', () => {
  const result = layoutFamily(tree([person('a'), person('b'), person('unconnected')], [edge('other', 'a', 'b', 'OTHER', 'Grandmother')]));
  assert.equal(result.positions.size, 3);
  assert.equal(result.edges[0].neutral, true);
  assert.equal(result.positions.get('a').y, result.positions.get('b').y);
});

test('renders more than 100 nodes including invitations without overlap or silently dropping data', () => {
  const nodes = [person('root'), ...Array.from({ length: 170 }, (_, index) => person(`guest:${index}`, `Relative ${index}`, false))];
  const edges = nodes.slice(1).map((node, index) => edge(`link:${index}`, 'root', node.id, 'CHILD'));
  const result = layoutFamily(tree(nodes, edges));
  assert.equal(result.positions.size, nodes.length);
  assert.equal(result.edges.length, edges.length);
  const positions = [...result.positions.values()];
  for (let a = 0; a < positions.length; a++) {
    const current = positions[a];
    assert.ok(current.x >= 0 && current.y >= 0);
    assert.ok(current.x + NODE_WIDTH <= result.width && current.y + NODE_HEIGHT <= result.height);
    for (let b = a + 1; b < positions.length; b++) {
      const other = positions[b];
      assert.ok(Math.abs(current.x - other.x) >= NODE_WIDTH || Math.abs(current.y - other.y) >= NODE_HEIGHT);
    }
  }
});

test('handles empty data and missing endpoints safely', () => {
  assert.equal(layoutFamily(tree([])).positions.size, 0);
  const result = layoutFamily(tree([person('a')], [edge('missing', 'a', 'unknown', 'CHILD')]));
  assert.equal(result.positions.size, 1);
  assert.equal(result.edges.length, 0);
  assert.ok(Number.isFinite(result.width) && Number.isFinite(result.height));
});
