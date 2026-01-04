import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CellType, Grid, Point, Car, GridCell, ToolType, SpotType, WallType, ViewportCamera } from '../types';
import { THEME_EDIT, THEME_SIM, getZoneColor, getZoneColorBg } from '../constants';
import { Car as CarIcon, ArrowRight, ArrowLeft, DoorOpen, Zap, ArrowUp, MousePointer2, Accessibility, BatteryCharging, AlertCircle, Crosshair, ZoomIn, ZoomOut, Maximize, Move, RotateCcw, Lock } from 'lucide-react';

interface GridEditorProps {
  grid: Grid;
  cars: Car[];
  activeTool: string | CellType;
  isEditing: boolean;
  showDebug?: boolean;
  onCellClick: (x: number, y: number) => void;
  onEdgeClick?: (x: number, y: number, edge: 'north' | 'south' | 'east' | 'west') => void;
  onCellRightClick: (x: number, y: number) => void;
  onSelectionChange: (rect: { x: number, y: number, w: number, h: number } | null) => void;
  onFlowChange: (x: number, y: number, direction: number) => void;
  onDeleteSelection?: () => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
  bgImageUrl?: string | null;
  opacity: number;
  cellSize: number;
  showGridLines?: boolean;
}

const GridEditor: React.FC<GridEditorProps> = ({ 
  grid, 
  cars, 
  activeTool, 
  isEditing, 
  showDebug = false,
  onCellClick, 
  onEdgeClick,
  onCellRightClick,
  onSelectionChange,
  onFlowChange,
  onDeleteSelection,
  onEditStart,
  onEditEnd,
  bgImageUrl,
  opacity,
  cellSize,
  showGridLines = true
}) => {
  const height = grid.length;
  const width = grid[0]?.length || 0;
  const gridWidth = width * cellSize;
  const gridHeight = height * cellSize;
  
  // Theme Selection
  const THEME = isEditing ? THEME_EDIT : THEME_SIM;
  
  // Camera / Viewport State (View Space)
  const [view, setView] = useState<ViewportCamera>({ scale: 1, x: 20, y: 20 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPos, setLastPanPos] = useState({ x: 0, y: 0 });

  // Selection & Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragEnd, setDragEnd] = useState<Point | null>(null);
  const [hoverPos, setHoverPos] = useState<Point | null>(null);
  
  // Continuous Flow State
  const lastDragCell = useRef<Point | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard Listeners (Selection Operations)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isEditing) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (onDeleteSelection) onDeleteSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, onDeleteSelection]);

  // --- Coordinate Transformations ---

  // Convert Screen (Client) coordinates to World (Canvas) coordinates
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
        x: (clientX - rect.left - view.x) / view.scale,
        y: (clientY - rect.top - view.y) / view.scale
    };
  }, [view]);

  // Convert World coordinates to Grid Cell indices
  const worldToGrid = useCallback((worldX: number, worldY: number) => {
    return {
        x: Math.floor(worldX / cellSize),
        y: Math.floor(worldY / cellSize)
    };
  }, [cellSize]);

  const getGridCoords = useCallback((e: React.MouseEvent | MouseEvent) => {
      const world = screenToWorld(e.clientX, e.clientY);
      const gridPos = worldToGrid(world.x, world.y);
      // Clamp to grid bounds
      return { 
          x: Math.max(0, Math.min(gridPos.x, width - 1)), 
          y: Math.max(0, Math.min(gridPos.y, height - 1)) 
      };
  }, [screenToWorld, worldToGrid, width, height]);

  // --- Zoom & Pan Controls ---

  const handleWheel = (e: React.WheelEvent) => {
    // Zoom focused on mouse pointer
    if (e.ctrlKey || e.metaKey || !isPanning) { 
        const scaleAmount = -e.deltaY * 0.001;
        const newScale = Math.min(4, Math.max(0.2, view.scale * (1 + scaleAmount)));
        
        // Calculate point under mouse to zoom towards
        const rect = containerRef.current!.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Formula: newViewX = mouseX - (mouseX - oldViewX) * (newScale / oldScale)
        const newX = mouseX - (mouseX - view.x) * (newScale / view.scale);
        const newY = mouseY - (mouseY - view.y) * (newScale / view.scale);

        setView({ scale: newScale, x: newX, y: newY });
    }
  };

  const startPan = (clientX: number, clientY: number) => {
      setIsPanning(true);
      setLastPanPos({ x: clientX, y: clientY });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle Mouse or Spacebar held (conceptually) triggers pan
    if (e.button === 1 || e.button === 2) { 
        // Middle or Right click for Pan
        e.preventDefault(); 
        startPan(e.clientX, e.clientY);
        return;
    }

    if (!isEditing) {
        startPan(e.clientX, e.clientY);
        return;
    }

    // Signal start of editing transaction
    if (onEditStart) onEditStart();

    const coords = getGridCoords(e);
    
    // Edge Click Logic needs sub-cell detection in World Space
    if (activeTool === CellType.EMPTY || activeTool === 'SELECT') {
        const world = screenToWorld(e.clientX, e.clientY);
        const cellX = world.x % cellSize;
        const cellY = world.y % cellSize;
        const margin = cellSize * 0.25;

        let edge: 'north' | 'south' | 'east' | 'west' | null = null;
        if (cellY < margin) edge = 'north';
        else if (cellY > cellSize - margin) edge = 'south';
        else if (cellX < margin) edge = 'west';
        else if (cellX > cellSize - margin) edge = 'east';

        if (edge && onEdgeClick) {
             onEdgeClick(coords.x, coords.y, edge);
             return;
        }
    }

    // Tool Actions
    setIsDragging(true);
    setDragStart(coords);
    lastDragCell.current = coords; // Initialize flow drag

    if (activeTool === 'SELECT') {
      setDragEnd(coords);
      onSelectionChange(null);
    } else {
      if (e.button === 0) {
          // Initial Click
          if (activeTool !== 'FLOW') {
              onCellClick(coords.x, coords.y);
          }
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
        const dx = e.clientX - lastPanPos.x;
        const dy = e.clientY - lastPanPos.y;
        setView(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        setLastPanPos({ x: e.clientX, y: e.clientY });
        return;
    }

    const coords = getGridCoords(e);
    setHoverPos(coords);

    if (isDragging) {
      if (activeTool === 'SELECT') {
        setDragEnd(coords);
      } else if (activeTool === 'FLOW') {
        // Continuous Flow Mapping
        const last = lastDragCell.current;
        if (last && (last.x !== coords.x || last.y !== coords.y)) {
             // Moved to a new cell. Calculate direction FROM last TO current.
             const dx = coords.x - last.x;
             const dy = coords.y - last.y;
             
             // Simple orthogonal logic
             let angle = -1;
             if (dx > 0) angle = 90; // Right
             else if (dx < 0) angle = 270; // Left
             else if (dy > 0) angle = 180; // Down
             else if (dy < 0) angle = 0; // Up

             if (angle !== -1) {
                 // Update the PREVIOUS cell to point to CURRENT cell
                 onFlowChange(last.x, last.y, angle);
                 
                 // Update tracking
                 lastDragCell.current = coords;
             }
        }
      } else if (e.buttons === 1 && activeTool !== 'ROTATE' && activeTool !== CellType.EMPTY) {
        onCellClick(coords.x, coords.y);
      }
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
        setIsPanning(false);
        return;
    }

    if (isDragging) {
        if (activeTool === 'SELECT' && dragStart && dragEnd) {
          const x = Math.min(dragStart.x, dragEnd.x);
          const y = Math.min(dragStart.y, dragEnd.y);
          const w = Math.abs(dragEnd.x - dragStart.x) + 1;
          const h = Math.abs(dragEnd.y - dragStart.y) + 1;
          onSelectionChange({ x, y, w, h });
        }
    }
    
    setIsDragging(false);
    lastDragCell.current = null;
    if (activeTool !== 'SELECT') {
       setDragStart(null);
       setDragEnd(null);
    }
    
    // Signal end of transaction
    if (isEditing && onEditEnd) onEditEnd();
  };

  // Ensure transaction closes if mouse leaves the area while dragging
  const handleMouseLeave = () => {
      handleMouseUp();
  }

  // Zoom Helpers
  const handleResetZoom = () => setView({ scale: 1, x: 20, y: 20 });
  const handleZoomIn = () => setView(v => ({ ...v, scale: Math.min(4, v.scale * 1.2) }));
  const handleZoomOut = () => setView(v => ({ ...v, scale: Math.max(0.2, v.scale / 1.2) }));
  const handleFit = () => {
      if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const scaleX = (rect.width - 40) / gridWidth;
          const scaleY = (rect.height - 40) / gridHeight;
          const minScale = Math.min(scaleX, scaleY);
          setView({ 
              scale: Math.min(1.5, minScale), 
              x: (rect.width - gridWidth * Math.min(1.5, minScale)) / 2, 
              y: (rect.height - gridHeight * Math.min(1.5, minScale)) / 2 
          });
      }
  };


  // --- Render Helpers ---

  const renderCellContent = (cell: GridCell, x: number, y: number) => {
    const { type, rotation, label, customZone, spotType, edges, hasFlow, subMask, locked } = cell;
    const rotateStyle = { transform: `rotate(${rotation}deg)` };
    
    // ZONE OUTLINES (Smart Grouping)
    // Check neighbors to draw borders ONLY on the edges of the zone group
    const z = customZone;
    let borderTop = 'none';
    let borderBottom = 'none';
    let borderLeft = 'none';
    let borderRight = 'none';

    if (z && isEditing) {
        const color = getZoneColor(z);
        const style = `3px solid ${color}`; // Thick, visible border
        
        // Check North
        if (y === 0 || grid[y-1][x].customZone !== z) borderTop = style;
        // Check South
        if (y === height-1 || grid[y+1][x].customZone !== z) borderBottom = style;
        // Check West
        if (x === 0 || grid[y][x-1].customZone !== z) borderLeft = style;
        // Check East
        if (x === width-1 || grid[y][x+1].customZone !== z) borderRight = style;
    }
    
    const zoneStyle: React.CSSProperties = {
        borderTop,
        borderBottom,
        borderLeft,
        borderRight,
        backgroundColor: z ? getZoneColorBg(z, 0.15) : undefined,
        boxSizing: 'border-box', // Ensure borders don't break layout
        zIndex: z ? 10 : 0 // Bring zone outlines above standard grid lines
    };

    const content = () => {
        switch (type) {
            case CellType.EMPTY: return null;
            case CellType.PATH: 
                const isGhost = !hasFlow;
                return (
                    <div className="relative flex items-center justify-center w-full h-full">
                       {/* Arrow is visible if Flow tool is active OR if hasFlow, but subtle otherwise */}
                       {hasFlow && (
                           <ArrowUp 
                             size={cellSize * 0.5} 
                             className={`${isEditing ? THEME.pathFlowIconActive : THEME.pathFlowIcon}`} 
                             style={rotateStyle} 
                             strokeWidth={3}
                           />
                       )}
                       {isGhost && isEditing && (
                          <div className="absolute inset-0 opacity-20 bg-slate-900 pointer-events-none" />
                       )}
                    </div>
                );
            case CellType.PARKING: 
                let spotClass = THEME.spotStandard;
                let SpotIcon = null;

                if (spotType === SpotType.EV) {
                    spotClass = THEME.spotEV;
                    SpotIcon = <BatteryCharging size={cellSize * 0.4} className="text-emerald-500 absolute bottom-1 right-1 opacity-100" />;
                } else if (spotType === SpotType.DISABLED) {
                    spotClass = THEME.spotDisabled;
                    SpotIcon = <Accessibility size={cellSize * 0.4} className="text-blue-500 absolute bottom-1 right-1 opacity-100" />;
                } else if (spotType === SpotType.RESERVED) {
                    spotClass = THEME.spotReserved;
                    SpotIcon = <AlertCircle size={cellSize * 0.4} className="text-amber-500 absolute bottom-1 right-1 opacity-100" />;
                }

                return (
                    <div className={`flex flex-col items-center justify-center w-full h-full relative border-2 ${spotClass}`}>
                        <div className="w-1/2 h-1/6 bg-white/20 rounded-sm mb-0.5" />
                        {label && !customZone && (
                            <span className="font-mono text-slate-500 font-bold select-none absolute z-10" style={{ fontSize: Math.max(8, cellSize * 0.35) }}>
                                {label}
                            </span>
                        )}
                        {SpotIcon}
                    </div>
                );
            case CellType.ENTRY: return <ArrowRight className={THEME.entry} size={cellSize * 0.6} style={rotateStyle} strokeWidth={3} />;
            case CellType.EXIT: return <ArrowRight className={THEME.exit} size={cellSize * 0.6} style={rotateStyle} strokeWidth={3} />;
            case CellType.MALL: return <DoorOpen className={THEME.mall} size={cellSize * 0.6} strokeWidth={2.5} />;
            default: return null;
        }
    };

    // Determine background based on type using Palette
    let bgClass = '';
    if (type === CellType.WALL) bgClass = THEME.wall;
    else if (type === CellType.PATH) bgClass = hasFlow ? THEME.path : THEME.pathGhost;
    
    // Edges (Walls)
    const edgeWallStyle = "bg-slate-700 shadow-[0_0_1px_rgba(0,0,0,0.5)]";

    return (
        <div className={`w-full h-full relative ${bgClass} ${locked ? THEME.locked : ''}`} style={zoneStyle}>
            {edges?.north === WallType.SOLID && <div className={`absolute top-0 left-0 w-full h-[3px] ${edgeWallStyle} z-20`} />}
            {edges?.south === WallType.SOLID && <div className={`absolute bottom-0 left-0 w-full h-[3px] ${edgeWallStyle} z-20`} />}
            {edges?.west === WallType.SOLID && <div className={`absolute top-0 left-0 h-full w-[3px] ${edgeWallStyle} z-20`} />}
            {edges?.east === WallType.SOLID && <div className={`absolute top-0 right-0 h-full w-[3px] ${edgeWallStyle} z-20`} />}
            
            {subMask && (
                 <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 opacity-30 pointer-events-none z-0">
                     {subMask.flat().map((val, idx) => (
                         <div key={idx} className={val === 1 ? 'bg-red-900' : ''}></div>
                     ))}
                 </div>
            )}

            <div className={`w-full h-full flex items-center justify-center`}>
                {content()}
            </div>
            
            {customZone && (
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden z-20">
                    <span 
                      className="text-white px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm"
                      style={{ backgroundColor: getZoneColor(customZone) }}
                    >
                      {customZone}
                    </span>
                 </div>
            )}

            {locked && (
                <div className="absolute top-0.5 right-0.5 z-30 opacity-50">
                    <Lock size={cellSize * 0.3} className="text-red-500" />
                </div>
            )}
        </div>
    );
  };

  const getSelectionRectStyle = () => {
    if (!dragStart || !dragEnd) return undefined;
    const minX = Math.min(dragStart.x, dragEnd.x);
    const minY = Math.min(dragStart.y, dragEnd.y);
    const maxX = Math.max(dragStart.x, dragEnd.x);
    const maxY = Math.max(dragStart.y, dragEnd.y);
    
    return {
        left: minX * cellSize,
        top: minY * cellSize,
        width: (maxX - minX + 1) * cellSize,
        height: (maxY - minY + 1) * cellSize
    };
  };

  return (
    <div 
      className={`relative w-full h-full ${THEME.background} rounded-lg shadow-2xl border ${THEME.gridLine} select-none overflow-hidden transition-colors duration-300`}
      onMouseUp={handleMouseUp} 
      onMouseLeave={handleMouseLeave}
    >
      {/* Zoom Controls Overlay - Minimalist */}
      <div className="absolute bottom-4 right-4 z-50 flex gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-700 shadow-xl backdrop-blur-sm">
          <button onClick={handleZoomOut} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors" title="Zoom Out"><ZoomOut size={14}/></button>
          <span className="flex items-center text-[10px] w-10 justify-center font-mono text-slate-500">{Math.round(view.scale * 100)}%</span>
          <button onClick={handleZoomIn} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors" title="Zoom In"><ZoomIn size={14}/></button>
          <div className="w-px bg-slate-800 mx-1"></div>
          <button onClick={handleFit} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors" title="Fit to Screen"><Maximize size={14}/></button>
          <button onClick={handleResetZoom} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors" title="Reset"><RotateCcw size={14}/></button>
      </div>

      {/* Viewport Container */}
      <div 
        ref={containerRef}
        className={`w-full h-full relative ${isPanning ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
      >
          {/* World Container */}
          <div 
             className="absolute origin-top-left transition-transform duration-75 ease-out"
             style={{
                 transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                 width: gridWidth,
                 height: gridHeight
             }}
          >
              {bgImageUrl && (
                <div 
                    className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-200"
                    style={{
                        backgroundImage: `url(${bgImageUrl})`,
                        backgroundSize: '100% 100%',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                        // High Contrast Filter for Visibility
                        filter: isEditing ? 'grayscale(100%) contrast(1.1) brightness(1.1) opacity(0.5)' : 'grayscale(100%) contrast(0.9) opacity(0.3)',
                        opacity: opacity // Apply opacity here to prevent grid fade
                    }}
                />
              )}

              <div 
                className="grid gap-0 relative z-10"
                style={{ 
                  gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
                  width: 'fit-content',
                  // REMOVED opacity: opacity here. Grid should be solid.
                }}
              >
                {grid.map((row, y) => (
                  row.map((cell, x) => (
                    <div
                      key={`${x}-${y}`}
                      className={`
                        w-[${cellSize}px] h-[${cellSize}px] relative box-border
                        ${isEditing && hoverPos?.x === x && hoverPos?.y === y && !isPanning ? THEME.highlight : (showGridLines ? THEME.gridLine : 'border-transparent border')}
                      `}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (isEditing) onCellRightClick(x, y); 
                      }}
                    >
                      {renderCellContent(cell, x, y)}
                    </div>
                  ))
                ))}
              </div>
              
              {/* Debug Overlay */}
              {showDebug && (
                 <svg className="absolute top-0 left-0 pointer-events-none z-30 opacity-70" width={gridWidth} height={gridHeight}>
                     {cars.map(car => {
                         if (!car.path || car.path.length < 2) return null;
                         const points = car.path.map(p => `${p.x * cellSize + cellSize/2},${p.y * cellSize + cellSize/2}`).join(' ');
                         return <polyline key={car.id} points={points} fill="none" stroke="#22d3ee" strokeWidth="2" strokeDasharray="4" />;
                     })}
                 </svg>
              )}

              {/* Selection Box - Clean, Premium */}
              {activeTool === 'SELECT' && isDragging && dragStart && dragEnd && (
                 <div 
                    className={`absolute ${THEME.selectionBorder} border-2 ${THEME.selectionBg} pointer-events-none z-30`}
                    style={getSelectionRectStyle() || {}}
                 />
              )}

               {activeTool === 'SELECT' && !isDragging && dragStart && dragEnd && (
                 <div 
                    className={`absolute ${THEME.selectionBorder} border-2 ${THEME.selectionBg} pointer-events-none z-30`}
                    style={getSelectionRectStyle() || {}}
                 />
              )}

              {/* Vehicles */}
              <div className="absolute inset-0 pointer-events-none z-20">
                {cars.map((car) => (
                  <div
                    key={car.id}
                    className="absolute transition-all duration-300 ease-linear flex items-center justify-center"
                    style={{
                      width: cellSize,
                      height: cellSize,
                      left: car.x * cellSize,
                      top: car.y * cellSize,
                      transform: `scale(${car.state === 'parked' ? 0.9 : 1.1})`
                    }}
                  >
                    <div className={`p-1.5 rounded-full shadow-lg ${car.color} relative`}>
                      <CarIcon size={cellSize * 0.5} className="text-white fill-white/20" />
                      {car.type === SpotType.EV && (
                          <div className="absolute -top-1 -right-1 bg-emerald-500 text-white rounded-full w-3 h-3 flex items-center justify-center">
                              <Zap size={8} className="fill-current" />
                          </div>
                      )}
                      {car.type === SpotType.DISABLED && (
                          <div className="absolute -top-1 -right-1 bg-blue-500 text-white rounded-full w-3 h-3 flex items-center justify-center">
                              <Accessibility size={8} />
                          </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
          </div>
      </div>
    </div>
  );
};

export default GridEditor;
