
export enum CellType {
  EMPTY = 0,    // Wall/Obstacle
  WALL = 0,     // Alias for Wall
  PATH = 1,     // Drivable Road
  PARKING = 2,  // Parking Spot
  ENTRY = 3,    // Car Entry
  CAR_ENTRY = 3,// Alias
  EXIT = 4,     // Car Exit
  CAR_EXIT = 4, // Alias
  MALL = 5,     // Mall Entrance
  MALL_ENTRY = 5, // Alias
  DISPLAY = 6,  // Display Screen
  ZONE_A = 7,
  ZONE_B = 8,
  ZONE_C = 9,
  ZONE_D = 10,
}

export enum FloorType {
  BASEMENT = 'BASEMENT',
  UPPER = 'UPPER',
}

export enum Direction {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
}

export enum SpotType {
  STANDARD = 'STANDARD',
  COMPACT = 'COMPACT',
  EV = 'EV',
  DISABLED = 'DISABLED',
  RESERVED = 'RESERVED'
}

export enum WallType {
  NONE = 0,
  SOLID = 1
}

export interface GridEdges {
  north?: WallType;
  south?: WallType;
  east?: WallType;
  west?: WallType;
}

export interface Point {
  x: number;
  y: number;
}

export interface ViewportCamera {
  scale: number;        // zoom level (0.25x – 4x)
  x: number;            // pan X (offsetX)
  y: number;            // pan Y (offsetY)
}

// Universal Selection System
export interface SelectionContext {
  type: 'cell' | 'flow' | 'zone' | 'mixed';
  bounds: { x: number, y: number, w: number, h: number };
  cellIds: string[]; // Format "x,y"
}

export interface DriverProfile {
  patience: number;          // 0-1: Affects reroute tolerance
  walkingPreference: number; // 0-1: 1 = wants closest to mall, 0 = wants closest to entry
  parkingDurationBias: number; // Multiplier for parking time
}

export interface Car {
  id: string;
  x: number;
  y: number;
  state: 'entering' | 'parking' | 'parked' | 'exiting';
  target: Point | null;
  parkingTime: number; // How long to stay
  color: string;
  electricalCurrent: number; // Amps
  type: SpotType; // Car preference
  entryTick: number; // Time of entry for analytics
  profile: DriverProfile;
  
  // Debug & Nav
  path?: Point[]; // Current planned path
}

export type SimCar = Car;

export interface GridCell {
  type: CellType;
  rotation: number; // Degrees: 0, 90, 180, 270
  label?: string;   // For auto-generated slot labels (e.g., "P-1")
  customZone?: string; // For user-defined grouped zones (e.g., "VIP-1", "A1")
  spotType?: SpotType; // Type of parking spot
  tags?: string[]; // Semantic tags
  
  // Hybrid Geometry Extensions
  subMask?: number[][]; // Partial occupancy mask (0=free, 1=solid)
  edges?: GridEdges;    // Edge walls
  hasFlow?: boolean;    // Strict flow enforcement flag
  
  // Universal State
  locked?: boolean;     // Prevent editing
}

export interface CellData {
  x: number;
  y: number;
  type: CellType;
  direction?: Direction;
  orientation?: Direction;
  label?: string;
}

export interface ParkingLayout {
  grid: CellData[][];
  width: number;
  height: number;
  stats: {
    totalSpots: number;
  };
}

export type Grid = GridCell[][];

export type ToolType = CellType | 'ROTATE' | 'SELECT' | 'FLOW';

export interface SimulationConfig {
  timeScale: number; // 0.25 to 8
  isPaused: boolean;
  spawnRate: number; // Cars per minute (approx)
  showDebug: boolean; // Show paths and targets
  strictFlow: boolean; // Flow-as-Law: Vehicles cannot move without explicit flow
}
