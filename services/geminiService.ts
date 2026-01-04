import { GoogleGenAI, Type } from "@google/genai";
import { CellType, Grid, GridCell } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to convert File to Base64
export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export interface ExtractionConfig {
  mode: 'auto' | 'manual';
  sensitivity: number; // 1 (Low) - 3 (High)
}

export const extractLayoutFromImage = async (base64Image: string, config: ExtractionConfig): Promise<Grid> => {
  
  // MANUAL MODE: Return clean slate
  if (config.mode === 'manual') {
      // Return a standard 25x20 grid initialized as walls or empty
      // User will paint over the background image
      const rows = 20;
      const cols = 25;
      const manualGrid: Grid = Array(rows).fill(0).map(() => 
          Array(cols).fill(0).map(() => ({
              type: CellType.EMPTY, // Start with walls/empty
              rotation: 0
          }))
      );
      return manualGrid;
  }

  // AUTO MODE
  const modelId = "gemini-2.5-flash"; // Supports multimodal

  let detailPrompt = "Detect standard parking structures.";
  if (config.sensitivity === 3) {
      detailPrompt = "HIGH SENSITIVITY MODE. Detect every small pillar, obstacle, and narrow pathway accurately. Capture complex geometry.";
  } else if (config.sensitivity === 1) {
      detailPrompt = "LOW SENSITIVITY MODE. Simplify the layout. Ignore small obstacles. Focus on main driving lanes and large parking blocks.";
  }

  const systemInstruction = `
    You are a Computer Vision expert specializing in architectural plan parsing.
    
    Task: Analyze the provided image of a parking lot floor plan and convert it into a 2D numerical grid (Array of Arrays).
    
    Target Grid Size: Approximately 20x20 to 25x25. Downsample the image layout to fit this grid while maintaining the relative structure.
    
    ${detailPrompt}

    Coding Scheme:
    0 = Wall / Obstacle / Pillar / Void space
    1 = Driving Lane / Pathway
    2 = Parking Spot
    3 = Vehicle Entry Point (Usually arrows pointing IN)
    4 = Vehicle Exit Point (Usually arrows pointing OUT)
    5 = Mall/Pedestrian Entrance (Elevators, Doors)

    Rules:
    - Ensure all paths (1) are connected.
    - Ensure Entry (3) connects to Parking Spots (2) via Paths (1).
    - If you cannot clearly distinguish Entry/Exit, guess logical positions on the perimeter.
    - Return ONLY the JSON object.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
            { text: "Generate the 2D grid JSON for this parking lot." }
          ]
        }
      ],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            grid: {
              type: Type.ARRAY,
              items: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER }
              }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    const json = JSON.parse(text);
    const rawGrid: number[][] = json.grid;

    // Convert number[][] to GridCell[][]
    const structuredGrid: Grid = rawGrid.map(row => 
      row.map(cellValue => ({
        type: cellValue as CellType,
        rotation: 0,
        label: undefined
      }))
    );

    return structuredGrid;

  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    // Fallback grid if AI fails
    const fallback: Grid = Array(20).fill(0).map(() => 
      Array(20).fill({ type: CellType.EMPTY, rotation: 0 })
    );
    // Draw a simple box loop
    for(let i=1; i<19; i++) {
        fallback[i][1] = { type: CellType.PATH, rotation: 0 };
        fallback[i][18] = { type: CellType.PATH, rotation: 0 };
        fallback[1][i] = { type: CellType.PATH, rotation: 0 };
        fallback[18][i] = { type: CellType.PATH, rotation: 0 };
    }
    fallback[0][1] = { type: CellType.ENTRY, rotation: 90 };
    fallback[19][18] = { type: CellType.EXIT, rotation: 270 };
    fallback[10][10] = { type: CellType.MALL, rotation: 0 };
    return fallback;
  }
};
