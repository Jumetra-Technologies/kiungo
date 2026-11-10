/**
 * Selection on the lab canvas has one owner: the lab. React Flow only tells
 * us what the user did (its "select" changes from clicks, Shift-clicks and
 * the pane), and the lab pushes the result back down as props.
 *
 * Don't listen to React Flow's onSelectionChange for this. It also fires
 * when our own props arrive, one render late, so the stale value it reports
 * overwrites the newer one, the newer one comes back round, and the two
 * alternate until React stops with "Maximum update depth exceeded". That's
 * the crash users saw when finishing a wire while a part was selected.
 */

export type Selection = { nodes: string[]; wire: string | null };
export type SelectChange = { type: string; id?: string; selected?: boolean };

/**
 * Apply React Flow's node and edge changes to the current selection.
 * Returns null if nothing about selection changed (so callers can skip
 * setting state).
 */
export function nextSelection(current: Selection, nodeChanges: readonly SelectChange[], edgeChanges: readonly SelectChange[] = []): Selection | null {
  const nodeSel = nodeChanges.filter((c) => c.type === "select" && c.id);
  const edgeSel = edgeChanges.filter((c) => c.type === "select" && c.id);
  if (!nodeSel.length && !edgeSel.length) return null;

  const ids = [...current.nodes];
  for (const c of nodeSel) {
    const at = ids.indexOf(c.id!);
    if (c.selected && at < 0) ids.push(c.id!);
    if (!c.selected && at >= 0) ids.splice(at, 1);
  }

  let wire = current.wire;
  for (const c of edgeSel) {
    if (c.selected) wire = c.id!;
    else if (wire === c.id) wire = null;
  }
  // A wire is inspected on its own; picking parts clears it.
  if (ids.length && nodeSel.some((c) => c.selected)) wire = null;
  if (wire && edgeSel.some((c) => c.selected)) ids.length = 0;

  const same = wire === current.wire && ids.length === current.nodes.length && ids.every((id, i) => id === current.nodes[i]);
  return same ? null : { nodes: ids, wire };
}
