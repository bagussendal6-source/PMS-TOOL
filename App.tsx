import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { extractLayoutFromImage, fileToGenerativePart, ExtractionConfig } from './services/geminiService';
import { CellType, Grid, ToolType, Car, Point, GridCell, SpotType, WallType, SimulationConfig } from './types';
import GridEditor from './components/GridEditor';
import { findPath, findBestSpot, getEntryPoints, getExitPoint, createDriverProfile, generateMallDistanceMap } from './utils/simulation';
import { Upload, Play, Edit2, Layout, MousePointer2, Car as CarIcon, DoorOpen, LogIn, LogOut, Ban, Eye, Layers, RotateCw, ZoomIn, BoxSelect, ArrowRightCircle, Save, Download, FileJson, BatteryCharging, Accessibility, AlertCircle, TrendingUp, Clock, Grid3X3, Pause, RefreshCw, Trash2, Gauge, Bug, ShieldAlert, ArrowLeftRight, Undo2, Redo2, Wand2, Settings2, Lock, Unlock, Group, Tag } from 'lucide-react';

const TOOLS = [
  { id: 'SELECT' as ToolType, label: 'Select', icon: <BoxSelect size={18} />, color: 'text-blue-500', active: 'bg-blue-600/20 border-blue-600' },
  { id: 'FLOW' as ToolType, label: 'Flow', icon: <ArrowRightCircle size={18} />, color: 'text-cyan-500', active: 'bg-cyan-600/20 border-cyan-600' },
  { id: CellType.PATH, label: 'Path', icon: <Layout size={18} />, color: 'text-slate-500', active: 'bg-slate-600/20 border-slate-600' },
  { id: CellType.PARKING, label: 'Spot', icon: <CarIcon size={18} />, color: 'text-indigo-500', active: 'bg-indigo-600/20 border-indigo-600' },
  { id: CellType.EMPTY, label: 'Wall', icon: <Ban size={18} />, color: 'text-slate-500', active: 'bg-slate-600/20 border-slate-600' },
  { id: CellType.ENTRY, label: 'Entry', icon: <LogIn size={18} />, color: 'text-emerald-500', active: 'bg-emerald-600/20 border-emerald-600' },
  { id: CellType.EXIT, label: 'Exit', icon: <LogOut size={18} />, color: 'text-rose-500', active: 'bg-rose-600/20 border-rose-600' },
  { id: CellType.MALL, label: 'Mall', icon: <DoorOpen size={18} />, color: 'text-purple-500', active: 'bg-purple-600/20 border-purple-600' },
  { id: 'ROTATE', label: 'Rotate', icon: <RotateCw size={18} />, color: 'text-orange-500', active: 'bg-orange-600/20 border-orange-600' }, 
];

const CAR_COLORS = [
  'bg-blue-500', 'bg-red-500', 'bg-green-500', 'bg-yellow-500', 'bg-orange-500', 'bg-cyan-500'
];

const App: React.FC = () => {
  const [step, setStep] = useState<'upload' | 'configure' | 'processing' | 'edit' | 'simulate'>('upload');
  const [grid, setGrid] = useState<Grid>([]);
  const [selectedTool, setSelectedTool] = useState<ToolType>('SELECT'); 
  
  // Background & View
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.5);
  const [cellSize, setCellSize] = useState<number>(30); // Editing Resolution (Data Space)
  const [tempCellSize, setTempCellSize] = useState<number>(30); // Slider local state
  const [showGridLines, setShowGridLines] = useState(true);

  // Auto-Detect Config
  const [extractionConfig, setExtractionConfig] = useState<ExtractionConfig>({ mode: 'manual', sensitivity: 2 });
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Undo / Redo History Stacks
  const [history, setHistory] = useState<Grid[]>([]);
  const [redoStack, setRedoStack] = useState<Grid[]>([]);
  const transactionStartGrid = useRef<Grid | null>(null);

  // Sync temp state when model changes
  useEffect(() => {
    setTempCellSize(cellSize);
  }, [cellSize]);

  // Selection & Grouping
  const [selection, setSelection] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const [zoneNameInput, setZoneNameInput] = useState<string>('');
  const [selectedSpotType, setSelectedSpotType] = useState<SpotType>(SpotType.STANDARD);

  // Simulation State
  const [cars, setCars] = useState<Car[]>([]);
  const [occupiedSpots, setOccupiedSpots] = useState<Set<string>>(new Set());
  const [simConfig, setSimConfig] = useState<SimulationConfig>({
      timeScale: 1,
      isPaused: false,
      spawnRate: 10, 
      showDebug: false,
      strictFlow: true // Flow-as-Law
  });
  
  // Cache for Mall Distances
  const [mallDistMap, setMallDistMap] = useState<number[][] | null>(null);

  // Analytics State
  const [stats, setStats] = useState({
      totalCars: 0,
      avgParkingTime: 0,
      zoneUtilization: {} as Record<string, number>
  });
  const [tick, setTick] = useState(0);

  // Calculate Selection Statistics
  const selectionStats = useMemo(() => {
    if (!selection || grid.length === 0) return null;
    const counts: Record<string, number> = {};
    let lockedCount = 0;
    
    for(let y = selection.y; y < selection.y + selection.h; y++) {
        for(let x = selection.x; x < selection.x + selection.w; x++) {
            if (y < grid.length && x < grid[0].length) {
                const cell = grid[y][x];
                const typeName = cell.type === CellType.EMPTY ? 'Wall' : 
                                 cell.type === CellType.PATH ? 'Path' : 
                                 cell.type === CellType.PARKING ? 'Spot' : 'Other';
                counts[typeName] = (counts[typeName] || 0) + 1;
                if (cell.locked) lockedCount++;
            }
        }
    }
    return { counts, lockedCount, total: selection.w * selection.h };
  }, [selection, grid]);

  // Initialize/Update Mall Distance Map when entering simulation
  useEffect(() => {
      if (step === 'simulate' && grid.length > 0) {
          const distMap = generateMallDistanceMap(grid);
          setMallDistMap(distMap);
      }
  }, [step, grid]);

  // Auto-Label Slots Effect
  useEffect(() => {
    if (grid.length === 0) return;

    let hasChanges = false;
    let spotCounter = 1;
    const newGrid = grid.map(row => row.map(cell => {
      if (cell.type === CellType.PARKING && !cell.customZone) {
        const expectedLabel = `P-${spotCounter}`;
        spotCounter++;
        if (cell.label !== expectedLabel) {
            hasChanges = true;
            return { ...cell, label: expectedLabel };
        }
      }
      return cell;
    }));

    if (hasChanges) {
      setGrid(newGrid);
    }
  }, [grid.length, step === 'edit']);

  // --- Undo / Redo System ---

  const commitToHistory = useCallback((prevGrid: Grid) => {
    setHistory(prev => {
      const newHistory = [...prev, prevGrid];
      if (newHistory.length > 50) return newHistory.slice(1); // Limit stack
      return newHistory;
    });
    setRedoStack([]); // Clear redo on new action
  }, []);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    if (step === 'simulate') handleClearVehicles(); // Safety reset

    const previousGrid = history[history.length - 1];
    setRedoStack(prev => [grid, ...prev]);
    setHistory(prev => prev.slice(0, -1));
    setGrid(previousGrid);
  }, [history, grid, step]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    if (step === 'simulate') handleClearVehicles(); // Safety reset

    const nextGrid = redoStack[0];
    setHistory(prev => [...prev, grid]);
    setRedoStack(prev => prev.slice(1));
    setGrid(nextGrid);
  }, [redoStack, grid, step]);

  // Transaction Handlers for dragging operations
  const handleEditStart = useCallback(() => {
    transactionStartGrid.current = grid;
  }, [grid]);

  const handleEditEnd = useCallback(() => {
    if (transactionStartGrid.current) {
      // Only commit if grid actually changed
      if (transactionStartGrid.current !== grid) {
        commitToHistory(transactionStartGrid.current);
      }
      transactionStartGrid.current = null;
    }
  }, [grid, commitToHistory]);

  // Atomic Action Helper (for button clicks)
  const performAtomicEdit = useCallback((action: (g: Grid) => Grid) => {
    commitToHistory(grid);
    setGrid(prev => action(prev));
  }, [grid, commitToHistory]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (step !== 'edit') return;
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, handleUndo, handleRedo]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const objectUrl = URL.createObjectURL(file);
      setBgImageUrl(objectUrl);
      setUploadedFile(file);
      setStep('configure'); // Move to configuration step
    }
  };

  const handleStartProcessing = async () => {
    if (!uploadedFile) return;
    setStep('processing');
    try {
        const base64 = await fileToGenerativePart(uploadedFile);
        const layout = await extractLayoutFromImage(base64, extractionConfig);
        
        setHistory([]);
        setRedoStack([]);
        setGrid(layout);
        setStep('edit');
    } catch (err) {
        console.error(err);
        setStep('upload');
        alert("Failed to analyze image. Please try again.");
    }
  };
  
  const handleSaveLayout = () => {
    const data = JSON.stringify({ grid, cellSize, bgImageUrl });
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'parking-layout.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadLayout = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
       const reader = new FileReader();
       reader.onload = (event) => {
           try {
               const data = JSON.parse(event.target?.result as string);
               if (data.grid) {
                   setHistory([]); // Reset history
                   setRedoStack([]);
                   setGrid(data.grid);
               }
               if (data.cellSize) {
                   setCellSize(data.cellSize);
                   setTempCellSize(data.cellSize);
               }
               setStep('edit');
           } catch(err) {
               alert("Invalid file format");
           }
       };
       reader.readAsText(e.target.files[0]);
    }
  };

  // Grid Resampling (Variable Density) - Atomic
  const handleGridResample = (newCellSize: number) => {
      if (grid.length === 0) {
          setCellSize(newCellSize);
          return;
      }
      
      const oldRows = grid.length;
      const oldCols = grid[0].length;
      const worldWidth = oldCols * cellSize;
      const worldHeight = oldRows * cellSize;
      
      const newCols = Math.floor(worldWidth / newCellSize);
      const newRows = Math.floor(worldHeight / newCellSize);
      
      if (newCols === oldCols && newRows === oldRows && newCellSize === cellSize) return;

      commitToHistory(grid); // Save state before resample

      const newGrid: Grid = [];
      for (let y = 0; y < newRows; y++) {
          const row: GridCell[] = [];
          for (let x = 0; x < newCols; x++) {
              const wx = (x + 0.5) * newCellSize;
              const wy = (y + 0.5) * newCellSize;
              const oldX = Math.min(oldCols - 1, Math.floor(wx / cellSize));
              const oldY = Math.min(oldRows - 1, Math.floor(wy / cellSize));
              row.push({ ...grid[oldY][oldX], edges: undefined, subMask: undefined }); 
          }
          newGrid.push(row);
      }
      setGrid(newGrid);
      setCellSize(newCellSize);
      setSelection(null); 
  };

  const handleCellClick = (x: number, y: number) => {
    const newGrid = [...grid];
    newGrid[y] = [...newGrid[y]];
    const cell = newGrid[y][x];

    // Locked check
    if (cell.locked && selectedTool !== 'SELECT') return;

    // Masking check: If Selection is active, prevent editing outside of it
    // Unless tool is SELECT (handled in GridEditor)
    if (selection && selectedTool !== 'SELECT') {
        if (x < selection.x || x >= selection.x + selection.w ||
            y < selection.y || y >= selection.y + selection.h) {
            return;
        }
    }

    if (selectedTool === 'ROTATE') {
        newGrid[y][x] = { ...cell, rotation: (cell.rotation + 90) % 360 };
    } else if (selectedTool !== 'SELECT' && selectedTool !== 'FLOW') {
        newGrid[y][x] = { 
            ...cell, 
            type: selectedTool as CellType, 
            rotation: 0, 
            label: undefined,
            customZone: selectedTool === CellType.EMPTY ? undefined : cell.customZone,
            hasFlow: selectedTool === CellType.PATH ? false : cell.hasFlow
        };
    }
    setGrid(newGrid);
  };
  
  const handleEdgeClick = (x: number, y: number, edge: 'north' | 'south' | 'east' | 'west') => {
      // Locked check and Masking check handled implicitly? 
      // Need explicit check here too since it's an atomic op
      if (grid[y][x].locked) return;
      if (selection && (x < selection.x || x >= selection.x + selection.w || y < selection.y || y >= selection.y + selection.h)) return;

      performAtomicEdit((currentGrid) => {
          const newGrid = [...currentGrid];
          newGrid[y] = [...newGrid[y]];
          const cell = newGrid[y][x];
          const newEdges = { ...cell.edges };
          if (newEdges[edge] === WallType.SOLID) {
              newEdges[edge] = WallType.NONE;
          } else {
              newEdges[edge] = WallType.SOLID;
          }
          newGrid[y][x] = { ...cell, edges: newEdges };
          return newGrid;
      });
  };

  const handleFlowChange = (x: number, y: number, direction: number) => {
    // Flow requires existing path.
    // If selection active, only work inside.
    if (selection) {
        if (x < selection.x || x >= selection.x + selection.w ||
            y < selection.y || y >= selection.y + selection.h) {
            return;
        }
    }
    
    setGrid(currentGrid => {
        const newGrid = [...currentGrid];
        const cell = newGrid[y][x];
        if (cell.locked) return currentGrid;

        if (newGrid[y][x].type === CellType.PATH) {
            newGrid[y] = [...newGrid[y]];
            newGrid[y][x] = { ...newGrid[y][x], rotation: direction, hasFlow: true };
        }
        return newGrid;
    });
  };

  const handleCellRightClick = (x: number, y: number) => {
    // Locked check
    if (grid[y][x].locked) return;
    if (selection && (x < selection.x || x >= selection.x + selection.w || y < selection.y || y >= selection.y + selection.h)) return;

    performAtomicEdit((currentGrid) => {
        const newGrid = [...currentGrid];
        newGrid[y] = [...newGrid[y]];
        newGrid[y][x] = { type: CellType.EMPTY, rotation: 0, label: undefined, customZone: undefined, hasFlow: false, edges: {} };
        return newGrid;
    });
  };

  const handleApplyGroup = () => {
      if (!selection) return;
      performAtomicEdit((currentGrid) => {
        const newGrid = currentGrid.map((row, y) => row.map((cell, x) => {
            if (x >= selection.x && x < selection.x + selection.w && y >= selection.y && y < selection.y + selection.h) {
                if (cell.locked) return cell;
                return { 
                    ...cell, 
                    customZone: zoneNameInput.trim() || cell.customZone
                };
            }
            return cell;
        }));
        return newGrid;
      });
  };

  const handleApplyAttributes = () => {
      if (!selection) return;
      performAtomicEdit((currentGrid) => {
        const newGrid = currentGrid.map((row, y) => row.map((cell, x) => {
            if (x >= selection.x && x < selection.x + selection.w && y >= selection.y && y < selection.y + selection.h) {
                if (cell.locked) return cell;
                // Only apply spot type to parking cells
                if (cell.type === CellType.PARKING) {
                    return { ...cell, spotType: selectedSpotType };
                }
            }
            return cell;
        }));
        return newGrid;
      });
  };

  const handleUngroupSelection = () => {
    if (!selection) return;
    performAtomicEdit((currentGrid) => {
        const newGrid = currentGrid.map((row, y) => row.map((cell, x) => {
            if (x >= selection.x && x < selection.x + selection.w && y >= selection.y && y < selection.y + selection.h) {
                if (cell.locked) return cell;
                return { ...cell, customZone: undefined };
            }
            return cell;
        }));
        return newGrid;
      });
  };

  const handleDeleteSelection = () => {
      if (!selection) return;
      performAtomicEdit((currentGrid) => {
        const newGrid = currentGrid.map((row, y) => row.map((cell, x) => {
            if (x >= selection.x && x < selection.x + selection.w && y >= selection.y && y < selection.y + selection.h) {
              if (cell.locked) return cell;
              return { type: CellType.EMPTY, rotation: 0, label: undefined, customZone: undefined, hasFlow: false, edges: {} };
            }
            return cell;
        }));
        return newGrid;
      });
      setSelection(null);
  }

  const handleFlipFlowSelection = () => {
      if (!selection) return;
      performAtomicEdit((currentGrid) => {
        const newGrid = currentGrid.map((row, y) => row.map((cell, x) => {
            if (x >= selection.x && x < selection.x + selection.w && y >= selection.y && y < selection.y + selection.h) {
                if (cell.locked) return cell;
                if (cell.type === CellType.PATH && cell.hasFlow) {
                    return { ...cell, rotation: (cell.rotation + 180) % 360 };
                }
            }
            return cell;
        }));
        return newGrid;
      });
  };

  const handleLockSelection = (locked: boolean) => {
    if (!selection) return;
    performAtomicEdit((currentGrid) => {
        const newGrid = currentGrid.map((row, y) => row.map((cell, x) => {
            if (x >= selection.x && x < selection.x + selection.w && y >= selection.y && y < selection.y + selection.h) {
                return { ...cell, locked: locked };
            }
            return cell;
        }));
        return newGrid;
    });
  }

  const handleClearVehicles = () => {
    setCars([]);
    setOccupiedSpots(new Set());
  };

  const handleFullReset = () => {
    handleClearVehicles();
    setStats({
      totalCars: 0,
      avgParkingTime: 0,
      zoneUtilization: {}
    });
    setTick(0);
    setSimConfig(prev => ({ ...prev, isPaused: false }));
  };

  // Main Simulation Loop
  useEffect(() => {
    if (step !== 'simulate' || simConfig.isPaused) return;
    
    const BASE_INTERVAL = 300; 
    const intervalTime = BASE_INTERVAL / simConfig.timeScale;

    const interval = setInterval(() => {
      setTick(t => t + 1);
      
      setCars(prevCars => {
        const nextCars: Car[] = [];
        const entries = getEntryPoints(grid);
        const exit = getExitPoint(grid);

        prevCars.forEach(car => {
          let nextCar = { ...car };
          
          if (car.state === 'entering' || car.state === 'exiting') {
            if (car.target) {
               nextCar.electricalCurrent = 12 + Math.random() * 6;
               const path = findPath(grid, {x: car.x, y: car.y}, car.target, simConfig.strictFlow);
               nextCar.path = path;
               
               if (path.length > 1) {
                 nextCar.x = path[1].x;
                 nextCar.y = path[1].y;
               } else {
                 if (car.state === 'entering') {
                   nextCar.state = 'parking';
                   nextCar.parkingTime = Math.floor((20 + Math.random() * 40) * car.profile.parkingDurationBias);
                   nextCar.electricalCurrent = 0.5;
                   setStats(prev => ({ ...prev, totalCars: prev.totalCars + 1 }));
                 } else if (car.state === 'exiting') {
                   return;
                 }
               }
            }
          } else if (car.state === 'parking') {
            nextCar.electricalCurrent = 0.2 + Math.random() * 0.1;
            nextCar.parkingTime -= 1;
            if (nextCar.parkingTime <= 0) {
              nextCar.state = 'exiting';
              nextCar.target = exit;
              nextCar.electricalCurrent = 5.0; 
              setOccupiedSpots(prev => {
                const newSet = new Set(prev);
                newSet.delete(`${car.x},${car.y}`);
                return newSet;
              });
            } else {
               setOccupiedSpots(prev => new Set(prev).add(`${car.x},${car.y}`));
            }
          }
          nextCars.push(nextCar);
        });

        const spawnChance = simConfig.spawnRate / 200; 
        
        if (entries.length > 0 && Math.random() < spawnChance) {
           const spawnEntry = entries[Math.floor(Math.random() * entries.length)];
           const rand = Math.random();
           let carType = SpotType.STANDARD;
           let color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
           
           if (rand < 0.1) {
               carType = SpotType.EV;
               color = 'bg-emerald-500';
           } else if (rand < 0.15) {
               carType = SpotType.DISABLED;
               color = 'bg-blue-600';
           }

           const driverProfile = createDriverProfile();
           const targetSpot = findBestSpot(grid, occupiedSpots, spawnEntry, carType, driverProfile, mallDistMap || undefined);
           const isBlocked = prevCars.some(c => c.x === spawnEntry.x && c.y === spawnEntry.y);
           
           if (!isBlocked && targetSpot) {
             setOccupiedSpots(prev => new Set(prev).add(`${targetSpot.x},${targetSpot.y}`));
             nextCars.push({
               id: Math.random().toString(36).substr(2, 9),
               x: spawnEntry.x,
               y: spawnEntry.y,
               state: 'entering',
               target: targetSpot,
               parkingTime: 0,
               color: color,
               electricalCurrent: 0,
               type: carType,
               entryTick: tick,
               profile: driverProfile
             });
           }
        }
        return nextCars;
      });
    }, intervalTime);
    return () => clearInterval(interval);
  }, [step, grid, occupiedSpots, simConfig, tick, mallDistMap]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex flex-col">
      {/* Header - Compact & Premium */}
      <header className="bg-slate-900/80 backdrop-blur border-b border-slate-800 p-3 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-1.5 rounded-lg shadow-lg shadow-indigo-500/20"><Layout className="text-white" size={20}/></div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">AutoPark <span className="text-indigo-400">GenAI</span></h1>
          </div>
        </div>
        <div className="flex gap-2 items-center">
           {/* Undo / Redo Controls */}
           {step === 'edit' && (
             <div className="flex gap-1 bg-slate-800/50 p-1 rounded-md border border-slate-700/50 mr-2">
                <button 
                  onClick={handleUndo} 
                  disabled={history.length === 0}
                  className={`p-1.5 rounded transition-colors ${history.length === 0 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 size={16}/>
                </button>
                <button 
                  onClick={handleRedo} 
                  disabled={redoStack.length === 0}
                  className={`p-1.5 rounded transition-colors ${redoStack.length === 0 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 size={16}/>
                </button>
             </div>
           )}

           <label className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 cursor-pointer transition-colors text-slate-300">
              <FileJson size={14}/>
              <span>Load Layout</span>
              <input type="file" onChange={handleLoadLayout} className="hidden" accept=".json" />
           </label>
           <button 
              onClick={handleSaveLayout}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors text-slate-300"
           >
              <Save size={14}/>
              Save Layout
           </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 h-[calc(100vh-64px)] overflow-hidden">
        {step === 'upload' && (
          <div className="w-full max-w-xl p-10 border border-dashed border-slate-700 rounded-2xl bg-slate-900/50 flex flex-col items-center text-center hover:border-indigo-500/50 transition-colors">
            <h2 className="text-2xl font-semibold text-white mb-2 tracking-tight">Upload Parking Plan</h2>
            <p className="text-slate-500 mb-8 max-w-sm text-sm">Upload a layout image to begin digitization.</p>
            <label className="cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-lg font-medium shadow-lg shadow-indigo-500/20 transition-all text-sm">
              <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
              Select Image
            </label>
          </div>
        )}

        {/* Configuration Step */}
        {step === 'configure' && (
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in duration-300">
             <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-4">
                <div className="bg-indigo-600 p-2 rounded-lg"><Settings2 className="text-white" size={20} /></div>
                <div>
                   <h2 className="text-xl font-bold text-white">Detection Strategy</h2>
                   <p className="text-slate-400 text-xs">Configure how you want to start mapping.</p>
                </div>
             </div>

             <div className="space-y-6">
                <div className="flex flex-col gap-3">
                   <button 
                      onClick={() => setExtractionConfig(p => ({ ...p, mode: 'manual' }))}
                      className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${extractionConfig.mode === 'manual' ? 'bg-indigo-900/20 border-indigo-500 ring-1 ring-indigo-500/50' : 'bg-slate-800 border-slate-700 hover:bg-slate-800/80'}`}
                   >
                      <div className={`p-2 rounded-lg ${extractionConfig.mode === 'manual' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}><MousePointer2 size={18}/></div>
                      <div className="text-left">
                         <h3 className={`font-semibold text-sm ${extractionConfig.mode === 'manual' ? 'text-indigo-400' : 'text-slate-300'}`}>Manual Mapping</h3>
                         <p className="text-xs text-slate-500 mt-1">Start with a blank grid over your image. You have full control.</p>
                      </div>
                   </button>
                   
                   <button 
                      onClick={() => setExtractionConfig(p => ({ ...p, mode: 'auto' }))}
                      className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${extractionConfig.mode === 'auto' ? 'bg-emerald-900/20 border-emerald-500 ring-1 ring-emerald-500/50' : 'bg-slate-800 border-slate-700 hover:bg-slate-800/80'}`}
                   >
                       <div className={`p-2 rounded-lg ${extractionConfig.mode === 'auto' ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400'}`}><Wand2 size={18}/></div>
                       <div className="text-left">
                          <h3 className={`font-semibold text-sm ${extractionConfig.mode === 'auto' ? 'text-emerald-400' : 'text-slate-300'}`}>AI Auto-Detect</h3>
                          <p className="text-xs text-slate-500 mt-1">Let AI extract walls and paths. Good for high-contrast plans.</p>
                       </div>
                   </button>
                </div>

                {extractionConfig.mode === 'auto' && (
                    <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 animate-in slide-in-from-top-2">
                       <div className="flex justify-between text-xs font-medium text-slate-400 mb-2">
                           <span>Sensitivity</span>
                           <span className="text-emerald-400">{extractionConfig.sensitivity === 1 ? 'Low (Blocks)' : extractionConfig.sensitivity === 2 ? 'Medium' : 'High (Detail)'}</span>
                       </div>
                       <input 
                           type="range" min="1" max="3" step="1"
                           value={extractionConfig.sensitivity}
                           onChange={(e) => setExtractionConfig(p => ({ ...p, sensitivity: Number(e.target.value) }))}
                           className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                       />
                       <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                          <span>Cleaner</span>
                          <span>Detailed</span>
                       </div>
                    </div>
                )}
                
                <button 
                    onClick={handleStartProcessing}
                    className="w-full bg-white text-slate-900 font-bold py-3 rounded-xl hover:bg-slate-200 transition-colors shadow-lg"
                >
                    Start Mapping
                </button>
             </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
            <div className="w-12 h-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <h3 className="text-sm font-medium text-slate-300 tracking-wide uppercase">Processing Layout...</h3>
          </div>
        )}

        {(step === 'edit' || step === 'simulate') && grid.length > 0 && (
          <div className="flex flex-col lg:flex-row gap-4 w-full h-full max-w-[1600px]">
            {/* Sidebar Controls */}
            <div className="w-full lg:w-72 flex flex-col gap-4 order-2 lg:order-1 h-full overflow-y-auto pr-1">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
                {/* Mode Switcher */}
                <div className="flex gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700 mb-6">
                  <button onClick={() => setStep('edit')} className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${step === 'edit' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>Designer</button>
                  <button onClick={() => setStep('simulate')} className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${step === 'simulate' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>Simulation</button>
                </div>
                
                {step === 'simulate' ? (
                    // Simulation Controls
                    <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
                        <div>
                             <div className="flex justify-between items-center mb-4">
                                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Playback</h3>
                                <button 
                                    onClick={() => setSimConfig(p => ({ ...p, isPaused: !p.isPaused }))}
                                    className={`p-1.5 rounded-full transition-all ${simConfig.isPaused ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                >
                                    {simConfig.isPaused ? <Play size={14} fill="currentColor" /> : <Pause size={14} fill="currentColor" />}
                                </button>
                            </div>
                            
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-[10px] text-slate-400 mb-1.5 font-medium uppercase tracking-wide">
                                        <span>Time Scale</span>
                                        <span className="text-emerald-400">{simConfig.timeScale}x</span>
                                    </div>
                                    <input 
                                        type="range" min="0.25" max="4" step="0.25" 
                                        value={simConfig.timeScale} 
                                        onChange={(e) => setSimConfig(p => ({ ...p, timeScale: Number(e.target.value) }))}
                                        className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer appearance-none"
                                    />
                                </div>
                                <div>
                                    <div className="flex justify-between text-[10px] text-slate-400 mb-1.5 font-medium uppercase tracking-wide">
                                        <span>Spawn Rate</span>
                                        <span className="text-blue-400">{simConfig.spawnRate}/min</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="60" step="5" 
                                        value={simConfig.spawnRate} 
                                        onChange={(e) => setSimConfig(p => ({ ...p, spawnRate: Number(e.target.value) }))}
                                        className="w-full accent-blue-500 h-1 bg-slate-800 rounded-lg cursor-pointer appearance-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-800 space-y-3">
                             <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Governance</h3>
                             <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer p-2 rounded hover:bg-slate-800/50 transition-colors">
                                <input type="checkbox" checked={simConfig.strictFlow} onChange={(e) => setSimConfig(p => ({ ...p, strictFlow: e.target.checked }))} className="rounded bg-slate-800 border-slate-600 text-emerald-500 focus:ring-0 focus:ring-offset-0" />
                                <div className="flex flex-col">
                                    <span className="font-medium flex items-center gap-1.5"><ShieldAlert size={12} className="text-emerald-500"/> Strict Traffic Laws</span>
                                    <span className="text-[10px] text-slate-500">Vehicles obey flow direction</span>
                                </div>
                            </label>
                            <label className="flex items-center gap-3 text-xs text-slate-300 cursor-pointer p-2 rounded hover:bg-slate-800/50 transition-colors">
                                <input type="checkbox" checked={simConfig.showDebug} onChange={(e) => setSimConfig(p => ({ ...p, showDebug: e.target.checked }))} className="rounded bg-slate-800 border-slate-600 text-indigo-500 focus:ring-0 focus:ring-offset-0" />
                                <div className="flex flex-col">
                                    <span className="font-medium flex items-center gap-1.5"><Bug size={12} className="text-indigo-500"/> Debug Overlay</span>
                                    <span className="text-[10px] text-slate-500">Show paths & targets</span>
                                </div>
                            </label>
                        </div>
                        
                        <div className="flex gap-2 pt-2">
                             <button onClick={handleClearVehicles} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded text-[10px] font-medium border border-slate-700 flex items-center justify-center gap-1.5 uppercase tracking-wide transition-colors"><Trash2 size={12}/> Clear</button>
                             <button onClick={handleFullReset} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded text-[10px] font-medium border border-slate-700 flex items-center justify-center gap-1.5 uppercase tracking-wide transition-colors"><RefreshCw size={12}/> Reset All</button>
                        </div>
                    </div>
                ) : (
                    // Edit Controls
                    <div className="space-y-6 animate-in slide-in-from-left-2 duration-300">
                        {/* Engineering Section */}
                        <div>
                             <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Engineering</h3>
                             <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-[10px] text-slate-400 mb-1.5 font-medium uppercase tracking-wide">
                                        <span>Editing Density</span>
                                        <span className="text-indigo-400">{tempCellSize}px</span>
                                    </div>
                                    <input 
                                        type="range" min="20" max="60" step="5" 
                                        value={tempCellSize} 
                                        onMouseUp={() => handleGridResample(tempCellSize)}
                                        onChange={(e) => setTempCellSize(Number(e.target.value))}
                                        className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg cursor-pointer appearance-none"
                                    />
                                    <p className="text-[9px] text-slate-500 mt-1">Adjusts grid resolution, NOT zoom level.</p>
                                </div>
                                <div>
                                    <div className="flex justify-between text-[10px] text-slate-400 mb-1.5 font-medium uppercase tracking-wide">
                                        <span>Reference Opacity</span>
                                        <span>{Math.round(overlayOpacity * 100)}%</span>
                                    </div>
                                    <input type="range" min="0" max="1" step="0.05" value={overlayOpacity} onChange={(e) => setOverlayOpacity(Number(e.target.value))} className="w-full accent-slate-500 h-1 bg-slate-800 rounded-lg cursor-pointer appearance-none"/>
                                </div>
                                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                                    <input type="checkbox" checked={showGridLines} onChange={(e) => setShowGridLines(e.target.checked)} className="rounded bg-slate-800 border-slate-600 text-indigo-500 focus:ring-0" />
                                    Show Grid Lines
                                </label>
                            </div>
                        </div>

                        {/* Tools Section */}
                        <div className="pt-4 border-t border-slate-800">
                             <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Tools</h3>
                             <div className="grid grid-cols-2 gap-2">
                                {TOOLS.map((tool) => (
                                  <button
                                    key={tool.id}
                                    onClick={() => { setSelectedTool(tool.id as ToolType); if(tool.id !== 'SELECT' && tool.id !== 'FLOW') setSelection(null); }}
                                    className={`
                                      p-2.5 rounded-lg flex items-center gap-2 border transition-all
                                      ${selectedTool === tool.id 
                                        ? `${tool.active} shadow-sm ring-0` 
                                        : 'bg-slate-800/50 border-transparent hover:bg-slate-800 hover:border-slate-700'}
                                    `}
                                  >
                                    <div className={`flex items-center justify-center ${tool.color}`}>
                                      {tool.icon}
                                    </div>
                                    <span className={`text-xs font-medium ${selectedTool === tool.id ? 'text-white' : 'text-slate-400'}`}>{tool.label}</span>
                                  </button>
                                ))}
                              </div>
                              <div className="mt-3 text-[10px] text-slate-500 bg-slate-800/50 p-2 rounded border border-slate-800/50">
                                  {selectedTool === CellType.EMPTY ? "Click edges to toggle walls. Click center to clear." : 
                                   selectedTool === 'FLOW' ? "Drag to paint flow direction." : 
                                   "Select tool to paint grid."}
                              </div>
                        </div>
                    </div>
                )}
              </div>

              {step === 'edit' && selection && selectionStats && (
                  <div className="bg-slate-900 border border-blue-900/30 p-4 rounded-xl shadow-lg animate-in fade-in slide-in-from-left-4">
                      <h3 className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <BoxSelect size={12}/> Selection Context
                      </h3>

                      {/* Stats */}
                      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
                         {Object.entries(selectionStats.counts).map(([key, count]) => (
                             <span key={key} className="text-[10px] bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-slate-300 whitespace-nowrap">
                                 {key}: {count}
                             </span>
                         ))}
                      </div>
                      
                      <div className="space-y-3">
                          <div className="flex gap-2">
                              <button onClick={handleDeleteSelection} className="flex-1 bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 text-[10px] font-medium py-1.5 rounded transition-colors border border-rose-900/30 flex items-center justify-center gap-1">
                                  <Trash2 size={12}/> Delete
                              </button>
                              <button onClick={() => handleLockSelection(!selectionStats.lockedCount)} className={`flex-1 text-[10px] font-medium py-1.5 rounded transition-colors border flex items-center justify-center gap-1 ${selectionStats.lockedCount ? 'bg-amber-950/30 hover:bg-amber-900/50 text-amber-400 border-amber-900/30' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}`}>
                                  {selectionStats.lockedCount ? <><Unlock size={12}/> Unlock</> : <><Lock size={12}/> Lock</>}
                              </button>
                          </div>

                          {/* Group / Label System */}
                          <div className="pt-2 border-t border-slate-800/50">
                              <label className="text-[10px] text-slate-400 uppercase tracking-wide block mb-1.5 flex items-center gap-1"><Group size={10}/> Group / Label</label>
                              <div className="flex gap-2 mb-2">
                                  <input 
                                      type="text" 
                                      value={zoneNameInput} 
                                      onChange={(e) => setZoneNameInput(e.target.value)}
                                      placeholder="Name (e.g., Zone A, Main Lane)" 
                                      className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                                  />
                                  <button onClick={handleApplyGroup} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-3 rounded font-medium">Set</button>
                              </div>
                              <button onClick={handleUngroupSelection} className="w-full text-slate-500 hover:text-slate-300 text-[10px] text-center border border-dashed border-slate-700 rounded py-1 hover:border-slate-500">Ungroup Selected</button>
                          </div>

                          {/* Contextual Actions */}
                          {selectionStats.counts['Path'] && (
                              <div className="pt-2 border-t border-slate-800/50">
                                 <button onClick={handleFlipFlowSelection} className="w-full bg-cyan-950/30 hover:bg-cyan-900/50 text-cyan-400 text-[10px] font-medium py-1.5 rounded transition-colors border border-cyan-900/30 flex items-center justify-center gap-1">
                                    <ArrowLeftRight size={12}/> Flip Flow Direction
                                 </button>
                              </div>
                          )}

                          {selectionStats.counts['Spot'] && (
                            <div className="pt-2 border-t border-slate-800/50">
                                <label className="text-[10px] text-slate-400 uppercase tracking-wide block mb-1.5 flex items-center gap-1"><Tag size={10}/> Spot Attributes</label>
                                <select 
                                    value={selectedSpotType} 
                                    onChange={(e) => setSelectedSpotType(e.target.value as SpotType)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 mb-2"
                                >
                                    <option value={SpotType.STANDARD}>Standard</option>
                                    <option value={SpotType.COMPACT}>Compact</option>
                                    <option value={SpotType.EV}>EV Charging</option>
                                    <option value={SpotType.DISABLED}>Accessibility</option>
                                    <option value={SpotType.RESERVED}>Reserved</option>
                                </select>
                                <button onClick={handleApplyAttributes} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-1.5 rounded border border-slate-700 font-medium">Apply Attribute</button>
                            </div>
                          )}
                      </div>
                  </div>
              )}
              
              {step === 'simulate' && (
                  <div className="bg-slate-900 border border-emerald-900/30 p-4 rounded-xl shadow-lg">
                      <h3 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                          <TrendingUp size={12}/> Live Metrics
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                          <div className="bg-slate-800/50 p-2.5 rounded border border-slate-800">
                              <div className="text-[10px] text-slate-500 mb-1 flex items-center gap-1 uppercase tracking-wide"><CarIcon size={10}/> Parked</div>
                              <div className="text-xl font-bold text-white leading-none">{occupiedSpots.size}</div>
                          </div>
                          <div className="bg-slate-800/50 p-2.5 rounded border border-slate-800">
                              <div className="text-[10px] text-slate-500 mb-1 flex items-center gap-1 uppercase tracking-wide"><Clock size={10}/> Total</div>
                              <div className="text-xl font-bold text-white leading-none">{stats.totalCars}</div>
                          </div>
                      </div>
                      <div className="mt-3 flex justify-between items-end border-t border-slate-800 pt-2">
                         <span className="text-[10px] text-slate-500 font-medium">Occupancy</span>
                         <span className="text-emerald-400 font-bold text-sm">{Math.round((occupiedSpots.size / (grid.flat().filter(c => c.type === CellType.PARKING).length || 1)) * 100)}%</span>
                      </div>
                  </div>
              )}
            </div>

            {/* Main Canvas Area */}
            {/* REMOVED hardcoded bg-slate-900 to allow GridEditor's internal theme to shine through or manage its own BG */}
            <div className="flex-1 order-1 lg:order-2 flex flex-col rounded-xl overflow-hidden relative shadow-2xl border border-slate-800 bg-slate-950">
              
              {/* Optional Gradient Top Bar */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500/50 via-purple-500/50 to-emerald-500/50 z-20 pointer-events-none"></div>
              
              {/* Overlay Badge */}
              <div className="absolute top-4 left-4 z-20 bg-slate-900/90 p-2 rounded-lg border border-slate-700 backdrop-blur-md shadow-lg pointer-events-none">
                 <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    {step === 'edit' ? <MousePointer2 size={16} className="text-indigo-400"/> : <Play size={16} className="text-emerald-400"/>}
                    {step === 'edit' ? 'Layout Editor' : 'Live Simulation'}
                 </h2>
                 <div className="flex items-center gap-2 mt-1">
                     <span className="text-[10px] text-slate-500 font-mono bg-slate-800 px-1.5 rounded border border-slate-700/50">
                        {grid[0]?.length}x{grid.length}
                     </span>
                     {step === 'simulate' && simConfig.strictFlow && (
                         <span className="text-[10px] text-emerald-500 font-medium flex items-center gap-1">
                             <ShieldAlert size={10}/> Laws Active
                         </span>
                     )}
                 </div>
              </div>

              {/* Grid Container */}
              <div className="w-full h-full relative">
                <GridEditor 
                  grid={grid}
                  cars={cars}
                  activeTool={selectedTool}
                  isEditing={step === 'edit'}
                  showDebug={simConfig.showDebug}
                  onCellClick={handleCellClick}
                  onEdgeClick={handleEdgeClick}
                  onCellRightClick={handleCellRightClick}
                  onSelectionChange={setSelection}
                  onFlowChange={handleFlowChange}
                  onDeleteSelection={handleDeleteSelection}
                  onEditStart={handleEditStart}
                  onEditEnd={handleEditEnd}
                  bgImageUrl={bgImageUrl}
                  opacity={overlayOpacity}
                  cellSize={cellSize}
                  showGridLines={showGridLines}
                />
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
