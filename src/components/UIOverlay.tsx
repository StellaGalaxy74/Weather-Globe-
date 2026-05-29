import { Location, WeatherLayer, MOCK_LOCATIONS, ClimateFactors, MapType, ViewMode, WindOptions } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, Waves, ThermometerSun, Loader2, Sparkles, Sun, Cloud, CloudRain, Wind } from 'lucide-react';
import { useState, useEffect } from 'react';
import AtmosphericGraph from './AtmosphericGraph';

interface UIProps {
  activeLayer: WeatherLayer;
  setActiveLayer: (layer: WeatherLayer) => void;
  selectedLocation: Location | null;
  setSelectedLocation: (loc: Location | null) => void;
  climateFactors: ClimateFactors;
  setClimateFactors: React.Dispatch<React.SetStateAction<ClimateFactors>>;
  mapType: MapType;
  setMapType: (type: MapType) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  heatmapIntensity: number;
  setHeatmapIntensity: (v: number) => void;
  windOptions: WindOptions;
  setWindOptions: React.Dispatch<React.SetStateAction<WindOptions>>;
}

export default function UIOverlay({ activeLayer, setActiveLayer, selectedLocation, setSelectedLocation, climateFactors, setClimateFactors, mapType, setMapType, viewMode, setViewMode, heatmapIntensity, setHeatmapIntensity, windOptions, setWindOptions }: UIProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Location[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [progress, setProgress] = useState(0);

  const [globalAiSummary, setGlobalAiSummary] = useState<string | null>(null);
  const [isGeneratingGlobalSummary, setIsGeneratingGlobalSummary] = useState(false);

  const handleGetGlobalAiSummary = async () => {
    setIsGeneratingGlobalSummary(true);
    setGlobalAiSummary(null);
    try {
      const res = await fetch('/api/global-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ layer: activeLayer, warming: climateFactors.globalWarming, seaLevel: climateFactors.seaLevelRise }),
      });
      const data = await res.json();
      if (data.summary) {
        setGlobalAiSummary(data.summary);
      } else if (data.error) {
        setGlobalAiSummary(`Error: ${data.error}`);
      }
    } catch (e) {
      setGlobalAiSummary('Failed to communicate with AI subsystem.');
    }
    setIsGeneratingGlobalSummary(false);
  };

  useEffect(() => {
    let animationFrame: number;
    let lastTime = performance.now();

    const loop = (time: number) => {
      const delta = time - lastTime;
      setProgress((prev) => {
        const next = prev + (delta * 0.005);
        return next > 100 ? 0 : next;
      });
      lastTime = time;
      animationFrame = requestAnimationFrame(loop);
    };

    animationFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    setAiSummary(null);
  }, [selectedLocation?.id]);

  const handleGetAiSummary = async () => {
    if (!selectedLocation) return;
    setIsGeneratingSummary(true);
    setAiSummary(null);
    try {
      const res = await fetch('/api/weather-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(selectedLocation),
      });
      const data = await res.json();
      if (data.summary) {
        setAiSummary(data.summary);
      } else if (data.error) {
        setAiSummary(`Error: ${data.error}`);
      }
    } catch (e) {
      setAiSummary('Failed to communicate with AI subsystem.');
    }
    setIsGeneratingSummary(false);
  };

  useEffect(() => {
    const fetchLocations = async () => {
      if (searchQuery.trim().length === 0) {
        setSearchResults([]);
        return;
      }
      
      setIsSearching(true);
      const local = MOCK_LOCATIONS.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()));
      
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=5`);
        const data = await res.json();
        
        const remote: Location[] = data.map((d: any) => ({
          id: `dyn-${d.place_id}`,
          name: d.display_name.split(',')[0],
          lat: parseFloat(d.lat),
          lng: parseFloat(d.lon),
          temp: 15 + Math.floor(Math.random() * 15), 
          wind: Math.floor(Math.random() * 30),
          humidity: 40 + Math.floor(Math.random() * 40),
          aqi: 20 + Math.floor(Math.random() * 50),
          condition: 'Observed'
        }));
        
        const combined = [...local];
        for (const r of remote) {
          if (!combined.find(c => c.name.toLowerCase() === r.name.toLowerCase() || Math.abs(c.lat - r.lat) < 0.1)) {
            combined.push(r);
          }
        }
        setSearchResults(combined.slice(0, 5));
      } catch (e) {
        setSearchResults(local);
      }
      setIsSearching(false);
    };

    const timer = setTimeout(fetchLocations, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!selectedLocation || selectedLocation.forecast) return;

    let isMounted = true;
    const fetchForecast = async () => {
      try {
        const omRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${selectedLocation.lat}&longitude=${selectedLocation.lng}&current_weather=true&hourly=relativehumidity_2m&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`);
        const omData = await omRes.json();
        
        if (isMounted && omData.current_weather && omData.daily) {
          const wc = omData.current_weather.weathercode;
          const condition = wc > 50 ? 'Rain' : wc > 1 ? 'Cloudy' : 'Clear';
          
          const forecast = omData.daily.time.slice(1, 6).map((timeStr: string, i: number) => {
            const fWc = omData.daily.weathercode[i+1];
            const fCond = fWc > 50 ? 'Rain' : fWc > 1 ? 'Cloudy' : 'Clear';
            const date = new Date(timeStr);
            const day = date.toLocaleDateString('en-US', { weekday: 'short' });
            return {
              day,
              maxTemp: Math.round(omData.daily.temperature_2m_max[i+1]),
              minTemp: Math.round(omData.daily.temperature_2m_min[i+1]),
              condition: fCond
            }
          });

          setSelectedLocation({
            ...selectedLocation,
            temp: Math.round(omData.current_weather.temperature),
            wind: Math.round(omData.current_weather.windspeed),
            condition,
            humidity: omData.hourly?.relativehumidity_2m?.[0] ?? selectedLocation.humidity,
            forecast
          });
        }
      } catch (e) {
        console.warn("Failed to fetch forecast from Open-Meteo", e);
      }
    };
    
    fetchForecast();
    return () => { isMounted = false; };
  }, [selectedLocation?.id]);

  const handleSelectSearchResult = (loc: Location) => {
    setSelectedLocation(loc);
    setSearchQuery('');
    setSearchResults([]);
  };

  const layers: { id: WeatherLayer; label: string }[] = [
    { id: 'temperature', label: 'Temperature Heatmap' },
    { id: 'wind', label: 'Wind Patterns' },
    { id: 'rainfall', label: 'Rainfall & Precipitation' },
    { id: 'clouds', label: 'Cloud Density' },
    { id: 'humidity', label: 'Humidity' },
    { id: 'pressure', label: 'Atmospheric Pressure' },
    { id: 'air_quality', label: 'Air Quality (AQI)' },
    { id: 'storms', label: 'Storm Systems' },
    { id: 'snow', label: 'Snow & Ice' },
    { id: 'uv_index', label: 'UV Index' },
    { id: 'ocean_current', label: 'Ocean Currents' },
    { id: 'earthquakes', label: 'Seismic Activity' },
  ];

  return (
    <>
      {/* Top Navigation */}
      <header className="relative z-20 flex flex-row items-center justify-between px-8 py-6 pointer-events-auto">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[#38BDF8] rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(56,189,248,0.4)]">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-widest text-white">WEATHER GLOBE <span className="text-[#38BDF8] opacity-80 font-normal">v4.2</span></h1>
            <p className="text-[10px] text-slate-400 tracking-[0.2em] uppercase">Global Monitoring System // Active</p>
          </div>
        </div>
        <div className="flex flex-row items-center gap-6">
          <div className="relative z-50">
             <input 
               type="text" 
               placeholder="Search location..." 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="bg-[#0F172A]/80 border border-white/10 rounded-full px-4 py-2 pr-10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#38BDF8]/50 backdrop-blur-md transition-all w-72 shadow-lg"
             />
             {isSearching ? (
               <Loader2 className="w-4 h-4 text-[#38BDF8] absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none animate-spin" />
             ) : (
               <Search className="w-4 h-4 text-white/40 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
             )}
             
             <AnimatePresence>
               {searchResults.length > 0 && (
                 <motion.div 
                   initial={{ opacity: 0, y: -10 }}
                   animate={{ opacity: 1, y: 0 }}
                   exit={{ opacity: 0, y: -10 }}
                   className="absolute top-full mt-2 w-full bg-[#0F172A]/95 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl flex flex-col"
                 >
                   {searchResults.map(res => (
                     <button 
                       key={res.id} 
                       onClick={() => handleSelectSearchResult(res)}
                       className="px-4 py-3 text-left hover:bg-white/10 text-sm text-white transition-colors border-b border-white/5 last:border-0 flex justify-between items-center group"
                     >
                       <span className="font-medium group-hover:text-[#38BDF8] transition-colors">{res.name}</span>
                       <span className="text-[10px] text-white/40 font-mono">
                         {res.lat.toFixed(2)}°, {res.lng.toFixed(2)}°
                       </span>
                     </button>
                   ))}
                 </motion.div>
               )}
             </AnimatePresence>
          </div>

          <div className="flex flex-row items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-md hidden sm:flex">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-[10px] font-bold tracking-widest uppercase">NOAA-18</span>
          </div>
        </div>
      </header>

      <main className="flex-1 relative flex overflow-hidden">
        {/* Left Controls Panel */}
        <div className="w-80 pl-8 pb-8 pt-4 flex flex-col justify-start gap-4 z-20 pointer-events-auto hidden md:flex overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="space-y-1 mb-4 flex-shrink-0">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">Planetary Scale</span>
            <div className="h-[1px] w-12 bg-[#38BDF8]"></div>
          </div>
          
          <div className="flex bg-[#0F172A]/80 border border-white/10 rounded-lg p-1 flex-shrink-0 mb-4">
            {(['globe', 'map'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex-1 py-1.5 text-[10px] uppercase font-bold rounded-md transition-all ${viewMode === mode ? 'bg-[#38BDF8] text-[#050816]' : 'text-slate-400 hover:text-white'}`}
              >
                {mode === 'globe' ? '🌐 GLOBE' : '🗺️ PROJECTION'}
              </button>
            ))}
          </div>

          <div className="space-y-1 mb-4 flex-shrink-0">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">Map Topology</span>
            <div className="h-[1px] w-12 bg-[#38BDF8]"></div>
          </div>
          
          <div className="flex bg-[#0F172A]/80 border border-white/10 rounded-lg p-1 flex-shrink-0 mb-2">
            {(['default', 'satellite', 'terrain'] as MapType[]).map(type => (
              <button
                key={type}
                onClick={() => setMapType(type)}
                className={`flex-1 py-1.5 text-[10px] uppercase font-bold rounded-md transition-all ${mapType === type ? 'bg-[#38BDF8] text-[#050816]' : 'text-slate-400 hover:text-white'}`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="space-y-1 mb-4 flex-shrink-0 mt-4">
            <span className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">Visualization Layers</span>
            <div className="h-[1px] w-12 bg-[#38BDF8]"></div>
          </div>
          
          <div className="flex flex-col gap-4 flex-shrink-0">
            {layers.map((layer) => {
              const isActive = activeLayer === layer.id;
              return (
                <div key={layer.id} className="flex flex-col gap-2">
                  <button
                    onClick={() => setActiveLayer(layer.id)}
                    className={`flex items-center justify-between w-full p-4 rounded-xl backdrop-blur-xl transition-all ${
                      isActive 
                        ? 'bg-[#38BDF8]/20 border border-[#38BDF8]/40' 
                        : 'bg-white/5 border border-white/10 opacity-80 hover:opacity-100 hover:bg-white/10'
                    }`}
                  >
                    <span className="flex items-center gap-3 font-medium text-sm">
                      <span className={`w-4 h-4 rounded-sm ${isActive ? 'bg-[#38BDF8]' : 'border border-white/40'}`}></span>
                      {layer.label}
                    </span>
                    {isActive && <span className="text-[10px] bg-[#38BDF8] text-white px-1.5 rounded">ACTIVE</span>}
                  </button>
                  <AnimatePresence>
                    {isActive && layer.id === 'temperature' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 mt-1 bg-[#0F172A]/80 border border-white/5 rounded-xl flex flex-col gap-3 backdrop-blur-md">
                      <div className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold text-center border-b border-white/5 pb-2 mb-1">Thermal Scale</div>
                      <div className="flex flex-col gap-2.5 px-1 py-1">
                        <div className="flex items-center justify-between text-[11px] font-mono text-white/80">
                          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#DC2626]"></div><span>Extreme Heat</span></div>
                          <span className="text-white/90 font-semibold">&gt; 45°C</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-white/80">
                          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#F97316]"></div><span>Hot</span></div>
                          <span className="text-white/90">35°C to 45°C</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-white/80">
                          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#FACC15]"></div><span>Warm</span></div>
                          <span className="text-white/90">20°C to 35°C</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-white/80">
                          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#22C55E]"></div><span>Mild</span></div>
                          <span className="text-white/90">10°C to 20°C</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-white/80">
                          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#06B6D4]"></div><span>Cool</span></div>
                          <span className="text-white/90">0°C to 10°C</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-white/80">
                          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#1D4ED8]"></div><span>Cold</span></div>
                          <span className="text-white/90">-15°C to 0°C</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono text-white/80">
                          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#2E1065]"></div><span>Ext. Cold</span></div>
                          <span className="text-white/90">&lt; -15°C</span>
                        </div>
                      </div>
                      
                      <div className="mt-2 border-t border-white/5 pt-3">
                         <div className="flex justify-between text-[10px] mb-2 font-mono text-white/70">
                            <span>Opacity</span>
                            <span>{Math.round(heatmapIntensity * 100)}%</span>
                         </div>
                         <input type="range" min="0" max="1" step="0.05" value={heatmapIntensity} onChange={e => setHeatmapIntensity(parseFloat(e.target.value))} className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#38BDF8] [&::-webkit-slider-thumb]:rounded-full" />
                      </div>
                        </div>
                      </motion.div>
                    )}
                    {isActive && layer.id === 'wind' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 mt-1 bg-[#0F172A]/80 border border-white/5 rounded-xl flex flex-col gap-3 backdrop-blur-md">
                          <div className="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold text-center border-b border-white/5 pb-2 mb-1">Wind Controls</div>
                          
                          <div className="flex bg-[#0F172A]/80 border border-white/10 rounded-lg p-1">
                            {(['low', 'medium', 'ultra'] as const).map(mode => (
                              <button
                                key={mode}
                                onClick={() => {
                                  if (mode === 'ultra') setWindOptions(p => ({ ...p, mode, particleDensity: 1.5, speedIntensity: 1.2, vectorVisibility: true, opacity: 1.0 }));
                                  else if (mode === 'medium') setWindOptions(p => ({ ...p, mode, particleDensity: 0.8, speedIntensity: 1.0, vectorVisibility: false, opacity: 0.8 }));
                                  else setWindOptions(p => ({ ...p, mode, particleDensity: 0.4, speedIntensity: 0.8, vectorVisibility: false, opacity: 0.6 }));
                                }}
                                className={`flex-1 py-1 text-[10px] uppercase font-bold rounded-md transition-all ${windOptions.mode === mode ? 'bg-[#38BDF8] text-[#050816]' : 'text-slate-400 hover:text-white'}`}
                              >
                                {mode}
                              </button>
                            ))}
                          </div>
                          
                          <label className="flex items-center gap-2 cursor-pointer mt-1">
                            <input type="checkbox" checked={windOptions.showStreamlines} onChange={e => setWindOptions(p => ({ ...p, showStreamlines: e.target.checked }))} className="accent-[#38BDF8] h-3 w-3" />
                            <span className="text-[11px] font-mono text-white/80">Streamlines</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={windOptions.vectorVisibility} onChange={e => setWindOptions(p => ({ ...p, vectorVisibility: e.target.checked }))} className="accent-[#38BDF8] h-3 w-3" />
                            <span className="text-[11px] font-mono text-white/80">Vector Flow</span>
                          </label>
                          
                          <div className="mt-1">
                             <div className="flex justify-between text-[10px] mb-1 font-mono text-white/70">
                                <span>Density</span><span>{Math.round(windOptions.particleDensity * 100)}%</span>
                             </div>
                             <input type="range" min="0.1" max="2.0" step="0.1" value={windOptions.particleDensity} onChange={e => setWindOptions(p => ({ ...p, particleDensity: parseFloat(e.target.value)}))} className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#38BDF8] [&::-webkit-slider-thumb]:rounded-full" />
                          </div>
                          
                          <div className="mt-1">
                             <div className="flex justify-between text-[10px] mb-1 font-mono text-white/70">
                                <span>Intensity (Speed)</span><span>{Math.round(windOptions.speedIntensity * 100)}%</span>
                             </div>
                             <input type="range" min="0.1" max="3.0" step="0.1" value={windOptions.speedIntensity} onChange={e => setWindOptions(p => ({ ...p, speedIntensity: parseFloat(e.target.value)}))} className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#38BDF8] [&::-webkit-slider-thumb]:rounded-full" />
                          </div>

                          <div className="mt-1 border-t border-white/5 pt-3">
                             <div className="flex justify-between text-[10px] mb-1 font-mono text-white/70">
                                <span>Opacity</span><span>{Math.round(windOptions.opacity * 100)}%</span>
                             </div>
                             <input type="range" min="0" max="1" step="0.05" value={windOptions.opacity} onChange={e => setWindOptions(p => ({ ...p, opacity: parseFloat(e.target.value)}))} className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#38BDF8] [&::-webkit-slider-thumb]:rounded-full" />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          <div className="mt-6 space-y-1 mb-4 flex-shrink-0">
            <span className="text-[11px] text-purple-400 font-bold uppercase tracking-widest">Simulation Engine</span>
            <div className="h-[1px] w-12 bg-purple-500"></div>
          </div>

          <div className="flex flex-col gap-3 flex-shrink-0">
            <button
              onClick={() => setClimateFactors(p => ({ ...p, globalWarming: !p.globalWarming }))}
              className={`flex items-center justify-between w-full p-3 rounded-xl backdrop-blur-xl transition-all ${
                climateFactors.globalWarming
                  ? 'bg-orange-500/20 border border-orange-500/40 text-orange-400' 
                  : 'bg-white/5 border border-white/10 opacity-80 hover:opacity-100 hover:bg-white/10'
              }`}
            >
              <span className="flex items-center gap-3 font-medium text-xs uppercase tracking-wider">
                <ThermometerSun className="w-4 h-4" /> Global Warming
              </span>
              <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${climateFactors.globalWarming ? 'bg-orange-500' : 'bg-slate-700'}`}>
                <div className={`w-3 h-3 rounded-full bg-white transition-transform ${climateFactors.globalWarming ? 'translate-x-4' : ''}`}></div>
              </div>
            </button>
            <button
              onClick={() => setClimateFactors(p => ({ ...p, seaLevelRise: !p.seaLevelRise }))}
              className={`flex items-center justify-between w-full p-3 rounded-xl backdrop-blur-xl transition-all ${
                climateFactors.seaLevelRise
                  ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-400' 
                  : 'bg-white/5 border border-white/10 opacity-80 hover:opacity-100 hover:bg-white/10'
              }`}
            >
              <span className="flex items-center gap-3 font-medium text-xs uppercase tracking-wider">
                <Waves className="w-4 h-4" /> Sea-level Rise
              </span>
              <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${climateFactors.seaLevelRise ? 'bg-cyan-500' : 'bg-slate-700'}`}>
                <div className={`w-3 h-3 rounded-full bg-white transition-transform ${climateFactors.seaLevelRise ? 'translate-x-4' : ''}`}></div>
              </div>
            </button>
          </div>

          <div className="mt-8 space-y-4 flex-shrink-0 pb-12">
            <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
              <p className="text-orange-400 text-[10px] font-bold uppercase mb-1 tracking-tighter italic">Alert: Cyclone Formation</p>
              <p className="text-xs text-slate-300">Pacific Rim Sector 7B // Est. Wind: 140km/h</p>
            </div>
          </div>
        </div>

        {/* Center Container */}
        <div className="flex-1 flex items-center justify-center relative pointer-events-none">
          <AnimatePresence>
            {selectedLocation && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="absolute right-[10%] top-[30%] group cursor-default pointer-events-auto"
              >
                <div className="w-56 bg-[#0F172A]/90 backdrop-blur-lg border border-white/10 p-4 rounded-lg shadow-2xl relative">
                  <button
                    onClick={() => setSelectedLocation(null)}
                    className="absolute top-2 right-2 text-white/50 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-bold text-cyan-400">REGION OBSERVER</span>
                  </div>
                  <h4 className="text-sm font-bold truncate pr-6">{selectedLocation.name}</h4>
                  <div className="text-[10px] text-white/50 mb-2">{selectedLocation.condition}</div>
                  <div className="flex items-end gap-2 mt-2">
                    <span className="text-3xl font-light tracking-tighter">{selectedLocation.temp}°C</span>
                    <span className="text-[10px] text-green-400 mb-1.5">AQI: {selectedLocation.aqi} Good</span>
                  </div>
                  <div className="mt-3 text-[10px] text-slate-400 flex flex-col gap-1 bg-white/5 p-2 rounded-lg">
                    <span className="flex justify-between"><span>Wind</span><span className="text-white">{selectedLocation.wind} km/h</span></span>
                    <span className="flex justify-between"><span>Humidity</span><span className="text-white">{selectedLocation.humidity}%</span></span>
                    <span className="flex justify-between"><span>Coordinates</span><span className="text-white">{selectedLocation.lat?.toFixed(1)}°, {selectedLocation.lng?.toFixed(1)}°</span></span>
                  </div>

                  <div className="mt-4 border-t border-white/10 pt-4">
                    {aiSummary ? (
                      <div className="text-[11px] leading-relaxed text-slate-300 italic bg-white/5 p-3 rounded-lg border border-white/5 max-h-32 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#38BDF8]/50 [&::-webkit-scrollbar-thumb]:rounded-full">
                        {aiSummary}
                      </div>
                    ) : (
                      <button
                        onClick={handleGetAiSummary}
                        disabled={isGeneratingSummary}
                        className="w-full flex items-center justify-center gap-2 bg-[#8B5CF6]/20 hover:bg-[#8B5CF6]/30 border border-[#8B5CF6]/40 text-[#A78BFA] py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50"
                      >
                        {isGeneratingSummary ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing...</>
                        ) : (
                          <><Sparkles className="w-3 h-3" /> Get AI Forecast</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Sidebar */}
        <div className="w-80 pr-8 pb-8 pt-4 flex flex-col justify-start gap-6 z-20 pointer-events-auto hidden xl:flex overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md flex-shrink-0">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-4 bg-purple-500 rounded-full"></div>
              <h3 className="text-xs font-bold uppercase tracking-widest">Global AI Summary</h3>
            </div>
            {globalAiSummary ? (
              <p className="text-[11px] leading-relaxed text-slate-300 italic mb-4">
                {globalAiSummary}
              </p>
            ) : (
              <p className="text-[11px] leading-relaxed text-slate-400 italic mb-4">
                Generate a real-time AI weather analysis based on active simulation layers and climate factors.
              </p>
            )}
            
            <button
              onClick={handleGetGlobalAiSummary}
              disabled={isGeneratingGlobalSummary}
              className="w-full flex items-center justify-center gap-2 bg-[#8B5CF6]/20 hover:bg-[#8B5CF6]/30 border border-[#8B5CF6]/40 text-[#A78BFA] py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-50"
            >
              {isGeneratingGlobalSummary ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing Planet...</>
              ) : (
                <><Sparkles className="w-3 h-3" /> Get Global Analysis</>
              )}
            </button>

            <div className="mt-4 flex gap-2">
               <span className="text-[9px] px-2 py-0.5 rounded bg-white/10 border border-white/10">PREDICTIVE</span>
               <span className="text-[9px] px-2 py-0.5 rounded bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/30">GEMINI PRO</span>
            </div>
          </div>

          <div className="flex-shrink-0">
            <AtmosphericGraph />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md flex-shrink-0 mb-12">
            <h3 className="text-xs font-bold uppercase tracking-widest mb-4 opacity-70">Data Integrated APIs</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-[10px]">
                 <span className="font-bold text-[#38BDF8]">Open-Meteo</span>
                 <span className="text-green-400 bg-green-400/10 px-1 rounded flex items-center gap-1"><div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>ACTIVE</span>
              </div>
              <p className="text-[9px] text-slate-400 leading-tight">Keyless completely free/open-source API for non-commercial use. 30+ models.</p>
              
              <div className="flex justify-between items-center text-[10px] pt-3 border-t border-white/5">
                 <span className="font-bold text-slate-300">OpenWeather</span>
                 <span className="text-slate-500 bg-white/5 px-1 rounded">STANDBY</span>
              </div>
              <p className="text-[9px] text-slate-500 leading-tight">Best for general forecasts. 1K calls/day. Historical & current.</p>
              
              <div className="flex justify-between items-center text-[10px] pt-3 border-t border-white/5">
                 <span className="font-bold text-slate-300">WeatherAPI.com</span>
                 <span className="text-slate-500 bg-white/5 px-1 rounded">STANDBY</span>
              </div>
              <p className="text-[9px] text-slate-500 leading-tight">Best for rich features. 1M calls/mo. 14-day forecasts & astronomy.</p>
              
              <div className="flex justify-between items-center text-[10px] pt-3 border-t border-white/5">
                 <span className="font-bold text-slate-300">Visual Crossing</span>
                 <span className="text-slate-500 bg-white/5 px-1 rounded">STANDBY</span>
              </div>
              <p className="text-[9px] text-slate-500 leading-tight">Deep historical archives (50+ years). Generous free tier.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Controls Bar */}
      <footer className="relative z-20 px-8 pb-8 pt-4 pointer-events-auto">
        <div className="bg-slate-900/40 border border-white/10 backdrop-blur-xl rounded-2xl px-6 py-4 flex flex-row items-center gap-8">
          <button className="flex-shrink-0 w-12 h-12 rounded-full border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors">
            <svg className="w-6 h-6 fill-white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
          
          <div className="flex-1">
            <div className="flex justify-between text-[10px] uppercase tracking-[0.2em] mb-2 font-bold opacity-60">
              <span>Simulation Timeline</span>
              <span>T + {(progress * 1.68).toFixed(1)} Hours (Forecast)</span>
            </div>
            <div className="relative h-2 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-[#38BDF8]/50 rounded-full transition-all duration-75" style={{ width: `${progress}%` }}></div>
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-[#050816] rounded-full border-2 border-[#38BDF8] shadow-[0_0_10px_#38BDF8] transition-all duration-75" 
                style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
              ></div>
              {/* Time Ticks */}
              <div className="absolute inset-0 flex justify-between px-1 pointer-events-none">
                <div className="w-[1px] h-full bg-white/10"></div><div className="w-[1px] h-full bg-white/10"></div><div className="w-[1px] h-full bg-white/10"></div><div className="w-[1px] h-full bg-white/10"></div><div className="w-[1px] h-full bg-white/10"></div><div className="w-[1px] h-full bg-white/10"></div>
              </div>
            </div>
          </div>

          <div className="hidden lg:flex gap-4 border-l border-white/10 pl-8">
            <div className="text-right">
              <p className="text-[10px] uppercase opacity-50 font-bold tracking-widest">Frame Rate</p>
              <p className="text-lg font-light">60.2 <span className="text-[10px] font-bold opacity-40">FPS</span></p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase opacity-50 font-bold tracking-widest">Latency</p>
              <p className="text-lg font-light">14 <span className="text-[10px] font-bold opacity-40">MS</span></p>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
