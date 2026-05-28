import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import Earth from './components/Earth';
import UIOverlay from './components/UIOverlay';
import { Location, WeatherLayer, MOCK_LOCATIONS, ClimateFactors, MapType } from './types';

export default function App() {
  const [activeLayer, setActiveLayer] = useState<WeatherLayer>('clouds');
  const [mapType, setMapType] = useState<MapType>('default');
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [climateFactors, setClimateFactors] = useState<ClimateFactors>({ seaLevelRise: false, globalWarming: false });
  const [dynamicLocations, setDynamicLocations] = useState<Location[]>([]);

  const handleSetSelectedLocation = (loc: Location | null) => {
    setSelectedLocation(loc);
    if (loc && !MOCK_LOCATIONS.find(l => l.id === loc.id) && !dynamicLocations.find(l => l.id === loc.id)) {
      setDynamicLocations(prev => [...prev, loc]);
    }
  };

  const allLocations = [...MOCK_LOCATIONS, ...dynamicLocations];

  return (
    <div className="w-full h-screen bg-[#050816] text-slate-100 overflow-hidden relative font-sans flex flex-col">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#0B1E40_0%,#050816_100%)] opacity-60 pointer-events-none"></div>
      
      <div className="absolute inset-0 z-0 pointer-events-auto">
        <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
          <Earth 
            activeLayer={activeLayer} 
            mapType={mapType}
            onLocationClick={handleSetSelectedLocation} 
            locations={allLocations}
            selectedLocationId={selectedLocation?.id}
            climateFactors={climateFactors}
          />
        </Canvas>
      </div>
      
      <div className="relative z-10 flex flex-col w-full h-full pointer-events-none">
        <UIOverlay 
          activeLayer={activeLayer}
          setActiveLayer={setActiveLayer}
          mapType={mapType}
          setMapType={setMapType}
          selectedLocation={selectedLocation}
          setSelectedLocation={handleSetSelectedLocation}
          climateFactors={climateFactors}
          setClimateFactors={setClimateFactors}
        />
      </div>
    </div>
  );
}


