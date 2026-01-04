import { CellType, Grid, Point, SpotType, WallType, DriverProfile } from '../types';

// Helper to create random driver personalities
export const createDriverProfile = (): DriverProfile => ({
  patience: Math.random(),
  walkingPreference: 0.3 + Math.random() * 0.7, // Bias towards walking preference (most people want close to mall)
  parkingDurationBias: 0.5 + Math.random() * 1.5,
});

// Pre-calculate distance from closest Mall Entrance to every cell
// Uses Multi-Source BFS
export const generateMallDistanceMap = (grid: Grid): number[][] => {
  const height = grid.length;
  const width = grid[0]?.length || 0;
  const distMap: number[][] = Array(height).fill(0).map(() => Array(width).fill(Infinity));
  const queue: Point[] = [];

  // Find all mall entrances
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell.type === CellType.MALL) {
      distMap[y][x] = 0;
      queue.push({ x, y });
    }
  }));

  // Standard BFS
  const directions = [{x:0, y:1}, {x:0, y:-1}, {x:1, y:0}, {x:-1, y:0}];
  
  while (queue.length > 0) {
    const { x, y } = queue.shift()!;
    const currentDist = distMap[y][x];

    for (const dir of directions) {
      const nx = x + dir.x;
      const ny = y + dir.y;

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const cell = grid[ny][nx];
        const isObstacle = cell.type === CellType.WALL;
        
        if (!isObstacle && distMap[ny][nx] > currentDist + 1) {
          distMap[ny][nx] = currentDist + 1;
          queue.push({ x: nx, y: ny });
        }
      }
    }
  }
  return distMap;
};

// Enforce strict flow and edge collision during pathfinding
// "Flow-As-Law" Implementation
export const findPath = (grid: Grid, start: Point, target: Point, strictMode: boolean = true): Point[] => {
  const height = grid.length;
  const width = grid[0].length;
  
  const queue: { pos: Point; path: Point[] }[] = [{ pos: start, path: [start] }];
  const visited = new Set<string>();
  visited.add(`${start.x},${start.y}`);

  // Directions mapped to degrees and edge names for checking
  const directions = [
    { x: 0, y: -1, deg: 0, edge: 'north', oppEdge: 'south' },    // UP
    { x: 1, y: 0, deg: 90, edge: 'east', oppEdge: 'west' },      // RIGHT
    { x: 0, y: 1, deg: 180, edge: 'south', oppEdge: 'north' },   // DOWN
    { x: -1, y: 0, deg: 270, edge: 'west', oppEdge: 'east' }     // LEFT
  ];

  while (queue.length > 0) {
    const { pos, path } = queue.shift()!;

    if (pos.x === target.x && pos.y === target.y) {
      return path;
    }

    const currentCell = grid[pos.y][pos.x];
    
    // Strict Flow Enforcement Logic
    // If strictMode is ON, vehicles can ONLY traverse PATH cells if they have flow defined.
    // Exception: Entry, Exit, and target Parking spots usually imply flow or are endpoints.
    
    let allowedDegrees: number | null = null;
    
    // Check if current cell enforces flow
    if (currentCell.type === CellType.PATH) {
        if (currentCell.hasFlow) {
            allowedDegrees = currentCell.rotation;
        } else if (strictMode) {
             // Blocked: Path cell with no flow in strict mode is untraversable
             // However, if we are currently ON it (start node), we must be allowed to leave it.
             // If this isn't the start node, we shouldn't have been able to enter it.
             if (pos.x !== start.x || pos.y !== start.y) {
                 // Dead end logic, though bfs shouldn't have added it if next check works.
             }
        }
    }

    for (const dir of directions) {
      // 1. Check strict flow constraint (Current Cell -> Next Cell)
      if (allowedDegrees !== null && allowedDegrees !== dir.deg) {
          continue; // Blocked by flow arrow
      }

      const nx = pos.x + dir.x;
      const ny = pos.y + dir.y;

      // 2. Check bounds
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nextCell = grid[ny][nx];
        const key = `${nx},${ny}`;
        
        // Flow-As-Law: Can we enter the next cell?
        // If next cell is a PATH and has flow, we must be entering it correctly? 
        // Actually, flow usually dictates EXIT direction from a cell, not entry.
        // But if next cell has flow pointing AGAINST us, it's a one-way street.
        // E.g. We are moving RIGHT (East). Next cell flow is LEFT (West). Collision.
        
        if (strictMode && nextCell.type === CellType.PATH && nextCell.hasFlow) {
             const flowDir = nextCell.rotation;
             const myEnterDir = dir.deg; 
             // Ideally, we move WITH flow. If next cell flow is perpendicular, it's a turn.
             // If next cell flow is opposite (180 deg diff), it's Do Not Enter.
             const diff = Math.abs(flowDir - myEnterDir);
             if (diff === 180) continue; // Entering one-way wrong way
        }

        // 3. Check Edge Walls (Hybrid Geometry)
        if (currentCell.edges && currentCell.edges[dir.edge as keyof typeof currentCell.edges] === WallType.SOLID) {
            continue; 
        }
        if (nextCell.edges && nextCell.edges[dir.oppEdge as keyof typeof nextCell.edges] === WallType.SOLID) {
            continue; 
        }

        // 4. Check Sub-Mask (Sub-Cell Precision)
        let subMaskBlocked = false;
        if (nextCell.subMask) {
            const flatMask = nextCell.subMask.flat();
            const solidCount = flatMask.filter(v => v === 1).length;
            if (solidCount > flatMask.length * 0.5) subMaskBlocked = true;
        }
        if (subMaskBlocked) continue;

        // 5. Check Walkability (Cell Type)
        // In strict mode, if it's a PATH, it MUST have flow (unless it's just created)
        // We warn user elsewhere, but here we treat undefined flow as 'stagnant' (allow entry but maybe warn).
        // BUT per prompt: "PATH cells WITHOUT flow are NOT traversable"
        
        let isWalkable = 
            nextCell.type === CellType.ENTRY || 
            nextCell.type === CellType.EXIT || 
            (nextCell.type === CellType.PARKING && nx === target.x && ny === target.y);

        if (nextCell.type === CellType.PATH) {
            if (strictMode) {
                if (nextCell.hasFlow) isWalkable = true;
                else isWalkable = false; // "Greyed path" rule
            } else {
                isWalkable = true;
            }
        }

        if (isWalkable && !visited.has(key)) {
          visited.add(key);
          queue.push({ pos: { x: nx, y: ny }, path: [...path, { x: nx, y: ny }] });
        }
      }
    }
  }

  return [];
};

// Smart Scoring System for Parking Spot Selection
export const findBestSpot = (
  grid: Grid, 
  occupiedSpots: Set<string>, 
  entryPoint: Point,
  carType: SpotType,
  profile: DriverProfile,
  mallDistanceMap?: number[][]
): Point | null => {
  const candidates: { point: Point; score: number }[] = [];
  
  // Weights (Configurable)
  const W_MALL = 2.0 * profile.walkingPreference; // High weight if they hate walking
  const W_ENTRY = 0.5 * (1 - profile.walkingPreference); // Weight for laziness (park near entry)
  const W_RANDOM = 0.2; // Add noise to prevent stacking

  grid.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.type === CellType.PARKING && !occupiedSpots.has(`${x},${y}`)) {
        // 1. Compatibility Check
        const cellSpotType = cell.spotType || SpotType.STANDARD;
        let isCompatible = false;

        if (carType === SpotType.EV) {
            if (cellSpotType === SpotType.EV || cellSpotType === SpotType.STANDARD) isCompatible = true;
        } else if (carType === SpotType.DISABLED) {
            if (cellSpotType === SpotType.DISABLED) isCompatible = true;
        } else {
            // Standard Car
            if (cellSpotType === SpotType.STANDARD || cellSpotType === SpotType.COMPACT) isCompatible = true;
        }

        if (isCompatible) {
            // 2. Scoring
            const distToMall = mallDistanceMap ? mallDistanceMap[y][x] : 0;
            // Approximation for distance from entry (Manhattan)
            const distFromEntry = Math.abs(x - entryPoint.x) + Math.abs(y - entryPoint.y);
            
            // Lower Score is Better
            const score = (distToMall * W_MALL) + (distFromEntry * W_ENTRY) + (Math.random() * 10 * W_RANDOM);
            
            candidates.push({ point: { x, y }, score });
        }
      }
    });
  });

  if (candidates.length === 0) return null;
  
  // Sort by score ascending (lowest first)
  candidates.sort((a, b) => a.score - b.score);
  
  // Pick top 1 to minimize search
  return candidates[0].point;
};

export const getEntryPoints = (grid: Grid): Point[] => {
  const entries: Point[] = [];
  grid.forEach((row, y) => row.forEach((cell, x) => {
    if (cell.type === CellType.ENTRY) entries.push({ x, y });
  }));
  return entries;
};

export const getExitPoint = (grid: Grid): Point | null => {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      if (grid[y][x].type === CellType.EXIT) return { x, y };
    }
  }
  return null;
};
