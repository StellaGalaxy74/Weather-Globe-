import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, useTexture, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useRef, useMemo, useState, useEffect } from 'react';
import { Location, WeatherLayer, ClimateFactors } from '../types';

interface EarthProps {
  activeLayer: WeatherLayer;
  onLocationClick: (loc: Location) => void;
  locations: Location[];
  selectedLocationId?: string;
  climateFactors: ClimateFactors;
}

const calcPosFromLatLonRad = (lat: number, lon: number, radius: number = 2.01) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = (radius * Math.sin(phi) * Math.sin(theta));
  const y = (radius * Math.cos(phi));

  return new THREE.Vector3(x, y, z);
};

function RainParticles() {
  const particlesRef = useRef<THREE.Points>(null);
  const count = 5000;
  
  const [positions] = useState(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
       const r = 2.02 + Math.random() * 0.5;
       const theta = 2 * Math.PI * Math.random();
       const phi = Math.acos(2 * Math.random() - 1);
       pos[i*3] = r * Math.sin(phi) * Math.cos(theta);
       pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
       pos[i*3+2] = r * Math.cos(phi);
    }
    return pos;
  });

  useFrame((state, delta) => {
     if (particlesRef.current) {
        const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
        for (let i=0; i<count; i++) {
           const ix = i * 3;
           const iy = i * 3 + 1;
           const iz = i * 3 + 2;
           const v = new THREE.Vector3(positions[ix], positions[iy], positions[iz]);
           const r = v.length();
           v.normalize();
           const newR = r - delta * 0.5;
           if (newR < 2.01) {
              const r2 = 2.5 + Math.random() * 0.2;
              positions[ix] = v.x * r2;
              positions[iy] = v.y * r2;
              positions[iz] = v.z * r2;
           } else {
              positions[ix] = v.x * newR;
              positions[iy] = v.y * newR;
              positions[iz] = v.z * newR;
           }
        }
        particlesRef.current.geometry.attributes.position.needsUpdate = true;
     }
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial color="#ffffff" size={0.01} transparent opacity={0.3} depthWrite={false} colorSpace={THREE.SRGBColorSpace} />
    </points>
  );
}

function Lightning() {
  const lightRef = useRef<THREE.PointLight>(null);
  
  useFrame(() => {
     if (lightRef.current) {
        if (Math.random() > 0.98) {
           lightRef.current.intensity = 10 + Math.random() * 20;
           const theta = 2 * Math.PI * Math.random();
           const phi = Math.acos(2 * Math.random() - 1);
           const r = 2.05;
           lightRef.current.position.set(
             r * Math.sin(phi) * Math.cos(theta),
             r * Math.sin(phi) * Math.sin(theta),
             r * Math.cos(phi)
           );
        } else {
           lightRef.current.intensity = THREE.MathUtils.lerp(lightRef.current.intensity, 0, 0.1);
        }
     }
  });

  return <pointLight ref={lightRef} color="#38BDF8" distance={4} decay={2} />;
}

export default function Earth({ activeLayer, onLocationClick, locations, selectedLocationId, climateFactors, mapType }: EarthProps & { mapType: MapType }) {
  const groupRef = useRef<THREE.Group>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const controlsRef = useRef<any>(null);
  const targetPos = useRef(new THREE.Vector3());
  const isAnimating = useRef(false);

  // Load textures
  const [satelliteMap, normalMap, specularMap, cloudsMap, defaultMap, terrainMap] = useTexture([
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg',
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg',
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg',
    'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png',
    'https://unpkg.com/three-globe/example/img/earth-day.jpg',
    'https://unpkg.com/three-globe/example/img/earth-topology.png'
  ]);

  const activeMap = mapType === 'default' ? defaultMap : mapType === 'satellite' ? satelliteMap : terrainMap;

  const tempMaterialRef = useRef<THREE.ShaderMaterial>(null);

  const temperatureShaderArgs = useMemo(() => {
    return {
      uniforms: {
        specularMap: { value: specularMap },
        opacity: { value: 0.75 },
        time: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        void main() {
          vUv = uv;
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        uniform sampler2D specularMap;
        uniform float opacity;
        uniform float time;

        vec3 getHeatmapColor(float value) {
          vec3 c1 = vec3(0.0, 0.0, 0.5);   // Dark Blue
          vec3 c2 = vec3(0.0, 0.5, 1.0);   // Blue
          vec3 c3 = vec3(0.0, 1.0, 1.0);   // Cyan
          vec3 c4 = vec3(0.0, 1.0, 0.0);   // Green
          vec3 c5 = vec3(1.0, 1.0, 0.0);   // Yellow
          vec3 c6 = vec3(1.0, 0.5, 0.0);   // Orange
          vec3 c7 = vec3(1.0, 0.0, 0.0);   // Red
          vec3 c8 = vec3(0.5, 0.0, 0.0);   // Dark Red

          if (value < 0.14) return mix(c1, c2, value / 0.14);
          if (value < 0.28) return mix(c2, c3, (value - 0.14) / 0.14);
          if (value < 0.42) return mix(c3, c4, (value - 0.28) / 0.14);
          if (value < 0.57) return mix(c4, c5, (value - 0.42) / 0.15);
          if (value < 0.71) return mix(c5, c6, (value - 0.57) / 0.14);
          if (value < 0.85) return mix(c6, c7, (value - 0.71) / 0.14);
          return mix(c7, c8, (value - 0.85) / 0.15);
        }

        void main() {
          float isOcean = texture2D(specularMap, vUv).r;
          float isLand = 1.0 - isOcean;
          
          float lat = abs(vPosition.y) / 2.0;
          float temp = 1.0 - pow(lat, 1.2);
          
          float noise = sin(vUv.x * 40.0 + time * 0.1) * cos(vUv.y * 40.0 + time * 0.1) * 0.05 
                      + sin(vUv.x * 10.0 - time * 0.05) * cos(vUv.y * 10.0 + time * 0.05) * 0.1;
          
          temp = temp + noise;
          
          if (isLand > 0.5) {
             temp = temp + 0.15; // Land is hotter 
          } else {
             temp = temp * 0.8 - 0.1; // Ocean is cooler
          }
          
          temp = clamp(temp, 0.0, 1.0);
          
          vec3 heat = getHeatmapColor(temp);
          float alpha = isLand > 0.5 ? opacity : opacity * 0.45;
          
          gl_FragColor = vec4(heat, alpha);
        }
      `,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false
    };
  }, [specularMap]);

  useEffect(() => {
    if (selectedLocationId) {
      const loc = locations.find(l => l.id === selectedLocationId);
      if (loc) {
        const pos = calcPosFromLatLonRad(loc.lat, loc.lng, 4.0);
        targetPos.current.copy(pos);
        isAnimating.current = true;
      }
    }
  }, [selectedLocationId, locations]);

  useFrame(({ camera, clock }) => {
    const elapsedTime = clock.getElapsedTime();
    if (cloudsRef.current) {
      cloudsRef.current.rotation.y = elapsedTime * 0.02;
    }
    if (ringRef.current) {
      const scale = 1 + Math.sin(elapsedTime * 4) * 0.2;
      ringRef.current.scale.set(scale, scale, scale);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(elapsedTime * 4) * 0.5;
    }
    if (tempMaterialRef.current) {
      tempMaterialRef.current.uniforms.time.value = elapsedTime;
    }

    if (isAnimating.current && controlsRef.current) {
      camera.position.lerp(targetPos.current, 0.05);
      controlsRef.current.target.lerp(new THREE.Vector3(0, 0, 0), 0.05);
      if (camera.position.distanceTo(targetPos.current) < 0.1) {
        isAnimating.current = false;
      }
    }
  });

  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 3, 5]} intensity={1.5} />
      
      <Stars radius={300} depth={60} count={5000} factor={7} saturation={0} fade speed={1} />
      
      <group ref={groupRef}>
        {/* Base Earth */}
        <mesh receiveShadow castShadow>
          <sphereGeometry args={[2, 64, 64]} />
          {mapType === 'satellite' ? (
            <meshStandardMaterial
              map={activeMap}
              normalMap={normalMap}
              roughnessMap={specularMap}
              roughness={0.8}
              metalness={0.1}
            />
          ) : (
            <meshBasicMaterial map={activeMap} />
          )}
        </mesh>

        {/* Temperature Heatmap Layer */}
        {activeLayer === 'temperature' && (
          <mesh>
            <sphereGeometry args={[2.005, 64, 64]} />
            <shaderMaterial ref={tempMaterialRef} args={[temperatureShaderArgs]} />
          </mesh>
        )}

        {/* Clouds Layer */}
        {(activeLayer === 'clouds' || activeLayer === 'pressure') && (
          <mesh ref={cloudsRef}>
            <sphereGeometry args={[2.02, 64, 64]} />
            <meshPhongMaterial
              map={cloudsMap}
              transparent={true}
              opacity={0.8}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        )}

        {(activeLayer === 'pressure' || activeLayer === 'humidity') && (
          <group>
            <RainParticles />
            {activeLayer === 'pressure' && <Lightning />}
          </group>
        )}

        {/* Atmosphere Glow */}
        <mesh>
          <sphereGeometry args={[2.05, 64, 64]} />
          <meshBasicMaterial
            color={
              climateFactors.globalWarming ? '#FB923C' :
              activeLayer === 'temperature' ? '#EF4444' :
              activeLayer === 'humidity' ? '#2563EB' :
              activeLayer === 'pressure' ? '#8B5CF6' :
              '#38BDF8'
            }
            transparent
            opacity={
              climateFactors.globalWarming ? 0.35 :
              activeLayer === 'clouds' ? 0.15 : 0.25
            }
            blending={THREE.AdditiveBlending}
            side={THREE.BackSide}
          />
        </mesh>

        {/* Global Warming Overlay */}
        {climateFactors.globalWarming && (
          <mesh>
            <sphereGeometry args={[2.02, 64, 64]} />
            <meshBasicMaterial color="#EF4444" transparent opacity={0.3} blending={THREE.AdditiveBlending} />
          </mesh>
        )}

        {/* Sea Level Rise Overlay */}
        {climateFactors.seaLevelRise && (
          <mesh>
            <sphereGeometry args={[2.015, 64, 64]} />
            <meshBasicMaterial color="#22D3EE" transparent opacity={0.6} blending={THREE.NormalBlending} />
          </mesh>
        )}

        {/* Location Markers */}
        {locations.map((loc) => {
          const pos = calcPosFromLatLonRad(loc.lat, loc.lng);
          const isSelected = selectedLocationId === loc.id;
          return (
            <group key={loc.id} position={pos}>
              <mesh onClick={(e) => { e.stopPropagation(); onLocationClick(loc); }}>
                <sphereGeometry args={[0.03, 16, 16]} />
                <meshBasicMaterial color={isSelected ? "#FB923C" : "#22D3EE"} />
                <Html distanceFactor={15}>
                  <div 
                    className={`text-[9px] font-mono font-medium -translate-x-1/2 mt-1 drop-shadow-md cursor-pointer transition-colors ${
                      isSelected ? "text-[#FB923C] scale-110" : "text-[#22D3EE] hover:text-white"
                    }`}
                    onClick={(e) => { e.stopPropagation(); onLocationClick(loc); }}
                  >
                    {loc.name}
                  </div>
                </Html>
              </mesh>
              {isSelected && (
                <mesh ref={ringRef}>
                  <ringGeometry args={[0.04, 0.05, 32]} />
                  <meshBasicMaterial color="#FB923C" transparent opacity={0.8} side={THREE.DoubleSide} />
                </mesh>
              )}
            </group>
          );
        })}
      </group>

      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableZoom={true}
        minDistance={2.5}
        maxDistance={10}
        rotateSpeed={0.5}
        autoRotate={!selectedLocationId && !isAnimating.current}
        autoRotateSpeed={0.5}
      />
    </>
  );
}
