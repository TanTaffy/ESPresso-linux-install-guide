import type { LayoutNode, Position } from '../model';

export function freePosition(
  nodes: LayoutNode[],
  dimensions: Record<string, { width: number; height: number }>,
  origin: Position,
): Position {
  // Reserve enough space for a task with several steps, even before measurement.
  for (let row = 0; ; row++)
    for (let column = 0; column < 3; column++) {
      const candidate = { x: origin.x + column * 360, y: origin.y + row * 600 };
      if (
        nodes.every((node) => {
          const size = dimensions[node.id] ?? { width: 300, height: 520 };
          return (
            candidate.x + 320 < node.position.x ||
            candidate.x > node.position.x + size.width + 40 ||
            candidate.y + 560 < node.position.y ||
            candidate.y > node.position.y + size.height + 40
          );
        })
      )
        return candidate;
    }
}
