import React from 'react';
import { ParkingLayout, CellType, CellData, SimCar, Direction } from '../types';
import { ZONE_COLORS } from '../constants';
import { Car, DoorOpen, LogIn, LogOut, ArrowRight, ArrowDown, ArrowUp, ArrowLeft, Monitor } from 'lucide-react';

interface ParkingGridProps {
  layout: ParkingLayout;
  loading: boolean;
  simCars: SimCar[];
  occupiedSpots: Set<string>;
  is3D: boolean;
}

const ParkingGrid: React.FC<ParkingGridProps> = ({ layout, loading, simCars, occupiedSpots, is3D }) => {
  const { grid, width, height } = layout;

  if (loading) {
    return (
      <div className="w-full h-[500px] flex flex-col items-center justify-center bg-slate-900/50 rounded-xl border border-slate-800 animate-pulse">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-indigo-400 font-medium">Generating Smart Layout...</p>
        <p className="text-slate-500 text-sm mt-2">Calculating 3D structure & traffic flow</p>
      </div>
    );
  }

  const renderDirectionArrow = (dir?: Direction) => {
    if (!dir) return null;
    const size = 12;
    const className = "text-slate-500/30 absolute pointer-events-none";
    switch (dir) {
      case Direction.RIGHT: return <ArrowRight size={size} className={className} />;
      case Direction.LEFT: return <ArrowLeft size={size} className={className} />;
      case Direction.UP: return <ArrowUp size={size} className={className} />;
      case Direction.DOWN: return <ArrowDown size={size} className={className} />;
      default: return null;
    }
  };

  // Helper for Wheel Stop position based on orientation
  const renderWheelStop = (orientation?: Direction) => {
    const baseClass = "absolute bg-yellow-500/80 rounded-sm";
    // Stopper should be at the "back" of the spot.
    // If car faces UP (towards path UP), stopper is DOWN (bottom).
    // Note: Orientation stored is usually where the PATH is.
    // So if Path is UP, Stopper is Bottom.
    switch (orientation) {
      case Direction.UP: // Path is Above, Stopper at Bottom
        return <div className={`${baseClass} bottom-1 left-1 right-1 h-1 shadow-sm`} />;
      case Direction.DOWN: // Path is Below, Stopper at Top
        return <div className={`${baseClass} top-1 left-1 right-1 h-1 shadow-sm`} />;
      case Direction.LEFT: // Path is Left, Stopper at Right
        return <div className={`${baseClass} right-1 top-1 bottom-1 w-1 shadow-sm`} />;
      case Direction.RIGHT: // Path is Right, Stopper at Left
        return <div className={`${baseClass} left-1 top-1 bottom-1 w-1 shadow-sm`} />;
      default: // Default bottom
        return <div className={`${baseClass} bottom-1 left-1 right-1 h-1 shadow-sm`} />;
    }
  };

  // Render a single cell based on its type
  const renderCell = (cell: CellData) => {
    // 3D Transforms for specific cell types
    const isWall = cell.type === CellType.WALL;
    const isDisplay = cell.type === CellType.DISPLAY;
    
    // Base classes
    let cellContent = null;
    let extraStyles = {};

    if (is3D) {
       // 3D Logic
       if (isWall) {
          return (
            <div className="w-full h-full relative transform-style-3d">
               {/* Pillar Base */}
               <div className="absolute inset-0 bg-slate-700 rounded-sm" />
               {/* Pillar Pop-up (Cube approximation) */}
               <div className="absolute inset-0 bg-slate-600 translate-z-8 border-t border-slate-500 shadow-xl rounded-sm">
                  {/* Top Highlight */}
               </div>
               {/* Side Faces (Simulated with borders or pseudo would be better, but simplified here) */}
               <div className="absolute -bottom-2 w-full h-2 bg-slate-800 origin-top rotate-x-90 translate-z-8" />
               <div className="absolute -right-2 w-2 h-full bg-slate-900 origin-left rotate-y-90 translate-z-8" />
            </div>
          );
       }
       
       if (isDisplay) {
         // Billboard standing up
         return (
            <div className="w-full h-full relative transform-style-3d flex items-center justify-center">
                <div className="absolute inset-0 bg-slate-800 rounded-full opacity-50 scale-75" /> {/* Base shadow */}
                <div 
                    className="absolute w-[120%] h-[150%] bg-cyan-900 border-2 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)] rounded-md flex items-center justify-center origin-bottom -rotate-x-90 translate-y-1/2 translate-z-0"
                >
                    <Monitor size={16} className="text-cyan-200 animate-pulse" />
                    <span className="text-[6px] text-cyan-100 absolute bottom-1">AD</span>
                </div>
            </div>
         );
       }
    }

    // Standard 2D or Flat base for 3D non-popped items
    const baseClasses = "w-full h-full flex items-center justify-center transition-all duration-300 relative group overflow-visible";
    
    switch (cell.type) {
      case CellType.WALL:
        return (
          <div className={`${baseClasses} bg-slate-800 rounded-sm border border-slate-700/50`}>
             <div className="w-1 h-1 bg-slate-700 rounded-full opacity-20"></div>
          </div>
        );

      case CellType.PATH:
        return (
          <div className={`${baseClasses} bg-slate-700/30`}>
            {renderDirectionArrow(cell.direction)}
            {/* Road Markings? */}
            <div className="w-1 h-1 bg-slate-600 rounded-full opacity-20"></div>
          </div>
        );

      case CellType.CAR_ENTRY:
        return (
          <div className={`${baseClasses} bg-emerald-500/20 border-2 border-emerald-500 rounded-md`}>
            {is3D && (
                <div className="absolute w-full h-8 bg-emerald-500/10 origin-bottom -rotate-x-90 bottom-0 border border-emerald-500/30" />
            )}
            <LogIn size={16} className="text-emerald-400" />
            {!is3D && <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">Entry</span>}
          </div>
        );

      case CellType.CAR_EXIT:
        return (
          <div className={`${baseClasses} bg-rose-500/20 border-2 border-rose-500 rounded-md`}>
            <LogOut size={16} className="text-rose-400" />
            {!is3D && <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">Exit</span>}
          </div>
        );

      case CellType.MALL_ENTRY:
        return (
          <div className={`${baseClasses} bg-purple-600 shadow-[0_0_15px_rgba(147,51,234,0.5)] rounded-md animate-pulse`}>
            <DoorOpen size={18} className="text-white" />
            {is3D && (
                <div className="absolute w-full h-[120%] bg-purple-500/30 origin-bottom -rotate-x-90 bottom-0 rounded-t-lg" />
            )}
          </div>
        );

      case CellType.DISPLAY: // 2D Fallback
        return (
            <div className={`${baseClasses} bg-cyan-900 border border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]`}>
                <Monitor size={16} className="text-cyan-400" />
            </div>
        );

      case CellType.ZONE_A:
      case CellType.ZONE_B:
      case CellType.ZONE_C:
      case CellType.ZONE_D:
        const colorClass = ZONE_COLORS[cell.type] || 'bg-gray-500';
        const cellId = `${cell.x},${cell.y}`;
        const isOccupied = occupiedSpots.has(cellId);
        
        return (
          <div className={`${baseClasses} ${colorClass} border border-dashed border-opacity-50 relative`}>
             {/* Wheel Stop */}
             {renderWheelStop(cell.orientation)}
             
             {/* Label */}
             <div className="absolute top-0 right-0 p-0.5">
                 <span className="text-[7px] font-bold opacity-50 leading-none">{cell.label}</span>
             </div>

             {/* Car */}
             <div className={`transform transition-all duration-500 ${isOccupied ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}>
                 <Car size={18} className="text-current drop-shadow-md" />
             </div>
          </div>
        );
        
      default:
        return <div className={baseClasses}></div>;
    }
  };

  return (
    <div className="w-full h-full overflow-hidden flex flex-col items-center">
      <div 
        className={`map-scroll overflow-auto max-w-full max-h-[70vh] p-8 md:p-12 rounded-xl transition-colors duration-500 ${is3D ? 'bg-slate-950 perspective-[1000px]' : 'bg-slate-900'}`}
      >
        <div 
            className={`grid gap-1 relative transition-transform duration-700 ease-in-out transform-style-3d ${is3D ? 'rotate-x-60 rotate-z-[-30deg] scale-90' : ''}`}
            style={{ 
                gridTemplateColumns: `repeat(${width}, minmax(32px, 1fr))`,
                width: 'fit-content',
                transformStyle: 'preserve-3d'
            }}
        >
            {grid.map((row, y) => (
                <React.Fragment key={y}>
                    {row.map((cell, x) => (
                        <div 
                            key={`${x}-${y}`} 
                            className="w-8 h-8 md:w-10 md:h-10 transform-style-3d" 
                            style={{ zIndex: is3D ? (y * width + x) : 'auto' }} // Simple Z-sorting for 3D overlap
                        >
                            {renderCell(cell)}
                        </div>
                    ))}
                </React.Fragment>
            ))}

            {/* Sim Layer - Only in 2D for now as 3D mapping is complex, or map it simple */}
            {!is3D && simCars.map((car) => {
                // Approximate position logic
                return null; // Handled by standard rendering or needs portal
            })}
        </div>
      </div>
      
      {/* Footer Stats */}
      <div className="mt-4 flex flex-wrap justify-center gap-6 text-slate-400 text-sm">
        <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>{layout.stats.totalSpots} Spots</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_5px_cyan]"></span>
            <span>{layout.grid.flat().filter(c => c.type === CellType.DISPLAY).length} Displays</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
            <span>{occupiedSpots.size} Occupied</span>
        </div>
      </div>
    </div>
  );
};

export default ParkingGrid;