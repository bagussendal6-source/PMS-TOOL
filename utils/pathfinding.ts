import { CellData, CellType, Point, Direction } from '../types';

// Directions for neighbor checking (Up, Right, Down, Left)
const DIRECTIONS = [
  { x: 0, y: -1, dir: Direction.UP },
  { x: 1, y: 0, dir: Direction.RIGHT },
  { x: 0, y: 1, dir: Direction.DOWN },
  { x: -1, y: 0, dir: Direction.LEFT },
];

export const findPath = (
  grid: CellData[][],
  start: Point,
  end: Point,
  width: number,
  height: number
): Point[] => {
  const queue: { point: Point; path: Point[] }[] = [{ point: start, path: [start] }];
  const visited = new Set<string>();
  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const { point, path } = queue.shift()!;

    if (point.x === end.x && point.y === end.y) {
      return path;
    }

    for (const d of DIRECTIONS) {
      const nx = point.x + d.x;
      const ny = point.y + d.y;

      if (
        nx >= 0 && nx < width &&
        ny >= 0 && ny < height &&
        !visited.has(`${nx},${ny}`)
      ) {
        const cellType = grid[ny][nx].type;
        // Allow movement on Path, Start, End, or passing through a spot (if necessary, though ideally paths only)
        // We generally restrict movement to PATH, ENTRY, EXIT
        if (
          cellType === CellType.PATH || 
          cellType === CellType.CAR_ENTRY || 
          cellType === CellType.CAR_EXIT ||
          cellType === CellType.MALL_ENTRY // Sometimes AI puts entry on path
        ) {
          visited.add(`${nx},${ny}`);
          queue.push({ point: { x: nx, y: ny }, path: [...path, { x: nx, y: ny }] });
        }
      }
    }
  }
  return []; // No path found
};

export const calculateFlowMap = (path: Point[]): Map<string, Direction> => {
  const map = new Map<string, Direction>();
  
  for (let i = 0; i < path.length - 1; i++) {
    const current = path[i];
    const next = path[i + 1];
    
    let dir: Direction = Direction.RIGHT;
    if (next.x > current.x) dir = Direction.RIGHT;
    else if (next.x < current.x) dir = Direction.LEFT;
    else if (next.y > current.y) dir = Direction.DOWN;
    else if (next.y < current.y) dir = Direction.UP;

    map.set(`${current.x},${current.y}`, dir);
  }
  
  // Set the last point direction same as previous for visual consistency
  if (path.length > 1) {
    const last = path[path.length - 1];
    const prev = path[path.length - 2];
    map.set(`${last.x},${last.y}`, map.get(`${prev.x},${prev.y}`)!);
  }

  return map;
};