import React from 'react';
import { LEGEND_ITEMS } from '../constants';

const LayoutLegend: React.FC = () => {
  return (
    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-lg">
      <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wider">Map Legend</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-1 gap-3">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <div 
              className={`w-8 h-8 rounded flex items-center justify-center text-[10px] font-bold text-white shadow-sm ${item.color}`}
            >
              {item.icon}
            </div>
            <span className="text-slate-400 text-xs font-medium">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LayoutLegend;