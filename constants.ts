import { CellType, FloorType } from './types';

export const CELL_SIZE = 40; // Default px

// --- DESIGN GOVERNANCE: DUAL THEME SYSTEM ---
// Edit Mode: Precision, Light, High Contrast.
// Sim Mode:  Cinematic, Dark, Low Distraction.

export const THEME_SIM = {
  // Structural
  background: 'bg-slate-950',
  gridLine: 'border-slate-800/30',
  wall: 'bg-slate-800', 
  wallBorder: 'border-slate-700',
  
  // Traversable
  path: 'bg-slate-900', 
  pathGhost: 'bg-slate-900/40 pattern-diagonal-lines', 
  pathFlowIcon: 'text-slate-500',
  pathFlowIconActive: 'text-cyan-500', 

  // Functional
  entry: 'text-emerald-500',
  exit: 'text-rose-500',
  mall: 'text-purple-500',
  
  // Spots
  spotStandard: 'border-slate-700 bg-slate-800/30',
  spotEV: 'border-emerald-900 bg-emerald-900/10',
  spotDisabled: 'border-blue-900 bg-blue-900/10',
  spotReserved: 'border-amber-900 bg-amber-900/10',

  // UI
  selectionBorder: 'border-blue-500',
  selectionBg: 'bg-blue-500/10',
  highlight: 'ring-1 ring-white/20',
  locked: 'pattern-diagonal-lines-sm text-slate-500/20',
};

export const THEME_EDIT = {
  // Structural - Light "Paper" Theme - HIGH CONTRAST ENFORCED
  background: 'bg-[#F8F9FA]', // Clean White-Grey
  gridLine: 'border-slate-300', // Stronger grid lines
  wall: 'bg-slate-800', // Dark wall for maximum structure visibility
  wallBorder: 'border-slate-900',
  
  // Traversable
  path: 'bg-white', // Clear path
  pathGhost: 'bg-slate-100 pattern-diagonal-lines-slate',
  pathFlowIcon: 'text-slate-400 opacity-100', // Always visible
  pathFlowIconActive: 'text-cyan-600 opacity-100', 

  // Functional - High Saturation for Tools
  entry: 'text-emerald-600',
  exit: 'text-rose-600',
  mall: 'text-purple-600',
  
  // Spots
  spotStandard: 'border-slate-400 bg-slate-200',
  spotEV: 'border-emerald-600 bg-emerald-100',
  spotDisabled: 'border-blue-600 bg-blue-100',
  spotReserved: 'border-amber-600 bg-amber-100',

  // UI
  selectionBorder: 'border-indigo-600',
  selectionBg: 'bg-indigo-600/20',
  highlight: 'ring-2 ring-indigo-500 z-50',
  locked: 'pattern-diagonal-lines-sm text-red-500/10 ring-inset ring-1 ring-red-500/20',
};

// Vibrant, distinct colors for Zone Labels
export const GENERATED_ZONE_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#84cc16', // Lime
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#d946ef', // Fuchsia
  '#f43f5e', // Rose
];

export const getZoneColor = (zone: string): string => {
    if (!zone) return 'transparent';
    let hash = 0;
    for (let i = 0; i < zone.length; i++) {
        hash = zone.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % GENERATED_ZONE_COLORS.length;
    return GENERATED_ZONE_COLORS[index];
}

// Convert Hex to RGBA for backgrounds
export const getZoneColorBg = (zone: string, alpha: number = 0.2): string => {
    const hex = getZoneColor(zone);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const ZONE_COLORS: Record<string, string> = {
  [CellType.ZONE_A]: 'bg-red-500/10 border-red-900/30 text-red-500',
  [CellType.ZONE_B]: 'bg-blue-500/10 border-blue-900/30 text-blue-500',
  [CellType.ZONE_C]: 'bg-green-500/10 border-green-900/30 text-green-500',
  [CellType.ZONE_D]: 'bg-yellow-500/10 border-yellow-900/30 text-yellow-500',
};

export const DEFAULT_PROMPTS = {
  [FloorType.BASEMENT]: `Generate a layout for a Basement Parking Floor...`,
  [FloorType.UPPER]: `Generate a layout for an Upper Parking Floor...`,
};

export const LEGEND_ITEMS = [
  { label: 'Path (Drivable)', color: 'bg-slate-900', icon: '' },
  { label: 'Wall / Structure', color: 'bg-slate-800', icon: '' },
  { label: 'Zone A', color: 'bg-red-900/20 border border-red-900/50', icon: 'A' },
  { label: 'Zone B', color: 'bg-blue-900/20 border border-blue-900/50', icon: 'B' },
  { label: 'Mall Entrance', color: 'bg-purple-900/20 border border-purple-500', icon: 'E' },
  { label: 'Vehicle Entry', color: 'bg-emerald-900/20 text-emerald-500', icon: 'IN' },
  { label: 'Vehicle Exit', color: 'bg-rose-900/20 text-rose-500', icon: 'OUT' },
];
