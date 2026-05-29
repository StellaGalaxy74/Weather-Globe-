import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, useTexture, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useRef, useMemo, useState, useEffect } from 'react';
import { Location, WeatherLayer, ClimateFactors, MapType, ViewMode, WindOptions } from '../types';

interface EarthProps {
  activeLayer: WeatherLayer;
  onLocationClick: (loc: Location) => void;
  locations: Location[];
  selectedLocationId?: string;
  climateFactors: ClimateFactors;
  mapType: MapType;
  viewMode: ViewMode;
  heatmapOpacity: number;
  windOptions: WindOptions;
}

const calcPosFromLatLonRad = (lat: number, lon: number, radius: number = 2.01) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    (radius * Math.cos(phi)),
    (radius * Math.sin(phi) * Math.sin(theta))
  );
};

// Converts lat/lon to map coordinates
const calcMapPosFromLatLon = (lat: number, lon: number, radius: number = 2.01) => {
  const mapW = 12.56637;
  const mapH = 6.28318;
  const u = (lon + 180) / 360;
  const v = (lat + 90) / 180;
  const zOffset = radius - 2.0;
  return new THREE.Vector3((u - 0.5) * mapW, (v - 0.5) * mapH, zOffset);
};

const commonVertexModifier = (shader: any, shadersRef: React.MutableRefObject<any[]>) => {
  shader.uniforms.projectionRatio = { value: 0 };
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    `#include <common>
     uniform float projectionRatio;`
  );
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    `
    vec3 transformed = vec3(position);
    float r = length(transformed);
    float zOffset = r - 2.0;
    float mapW = 12.56637;
    float mapH = 6.28318;
    vec3 mapPos = vec3((uv.x - 0.5) * mapW, (uv.y - 0.5) * mapH, zOffset);
    transformed = mix(transformed, mapPos, projectionRatio);
    `
  );
  shader.vertexShader = shader.vertexShader.replace(
    '#include <beginnormal_vertex>',
    `
    vec3 objectNormal = mix(normal, vec3(0.0, 0.0, 1.0), projectionRatio);
    `
  );
  shadersRef.current.push(shader);
};

export default function Earth({ activeLayer, onLocationClick, locations, selectedLocationId, climateFactors, mapType, viewMode, heatmapOpacity, windOptions }: EarthProps) {
  const groupRef = useRef<THREE.Group>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const controlsRef = useRef<any>(null);
  const targetPos = useRef(new THREE.Vector3());
  const isAnimating = useRef(false);
  const projectionRatioRef = useRef(0);
  const prevViewMode = useRef(viewMode);
  
  const shadersRef = useRef<any[]>([]);

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

  const layerTypeMap: Record<WeatherLayer, number> = {
    temperature: 0,
    wind: 1,
    rainfall: 2,
    clouds: 3,
    humidity: 4,
    pressure: 5,
    air_quality: 6,
    storms: 7,
    snow: 8,
    uv_index: 9,
    ocean_current: 10,
    earthquakes: 11
  };

  const heatmapLUT = useMemo(() => {
    const colors = [
      [0.18, 0.06, 0.40], // Deep Purple
      [0.0, 0.0, 0.5],    // Dark Blue
      [0.0, 0.5, 1.0],    // Blue
      [0.0, 1.0, 1.0],    // Cyan
      [0.0, 1.0, 0.0],    // Green
      [1.0, 1.0, 0.0],    // Yellow
      [1.0, 0.5, 0.0],    // Orange
      [1.0, 0.0, 0.0],    // Red
      [1.0, 0.0, 0.5],    // Pink
    ];
    const size = 256;
    const data = new Uint8Array(256 * 4);
    
    for (let i = 0; i < size; i++) {
      const t = i / (size - 1);
      const colorIndex = t * (colors.length - 1);
      const idx1 = Math.floor(colorIndex);
      const idx2 = Math.min(idx1 + 1, colors.length - 1);
      const fract = colorIndex - idx1;
      
      data[i * 4] = Math.round((colors[idx1][0] * (1 - fract) + colors[idx2][0] * fract) * 255);
      data[i * 4 + 1] = Math.round((colors[idx1][1] * (1 - fract) + colors[idx2][1] * fract) * 255);
      data[i * 4 + 2] = Math.round((colors[idx1][2] * (1 - fract) + colors[idx2][2] * fract) * 255);
      data[i * 4 + 3] = 255;
    }
    
    const texture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
  }, []);

  const atmosphereShaderArgs = useMemo(() => {
    return {
      uniforms: {
        specularMap: { value: specularMap },
        uHeatmapLUT: { value: heatmapLUT },
        opacity: { value: heatmapOpacity },
        time: { value: 0 },
        projectionRatio: { value: 0 },
        uLayerIndex: { value: 0 },
        uWindShowStreamlines: { value: 1.0 },
        uWindParticleDensity: { value: 0.8 },
        uWindSpeedIntensity: { value: 1.0 },
        uWindVectorVisibility: { value: 0.0 },
        uWindOpacity: { value: 0.8 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        uniform float projectionRatio;
        void main() {
          vUv = uv;
          vPosition = position;
          float r = length(position);
          float zOffset = r - 2.0;
          float mapW = 12.56637;
          float mapH = 6.28318;
          vec3 mapPos = vec3((uv.x - 0.5) * mapW, (uv.y - 0.5) * mapH, zOffset);
          vec3 transformedPos = mix(position, mapPos, projectionRatio);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(transformedPos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        uniform sampler2D specularMap;
        uniform sampler2D uHeatmapLUT;
        uniform float opacity;
        uniform float time;
        uniform int uLayerIndex;
        uniform float uWindShowStreamlines;
        uniform float uWindParticleDensity;
        uniform float uWindSpeedIntensity;
        uniform float uWindVectorVisibility;
        uniform float uWindOpacity;

        vec3 getHeatmapColor(float value) {
          return texture2D(uHeatmapLUT, vec2(clamp(value, 0.0, 1.0), 0.5)).rgb;
        }

        // --- Core Noise Functions ---
        vec2 hash(vec2 p) {
            p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
            return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
        }

        float noise(vec2 p) {
            const float K1 = 0.366025404; // (sqrt(3)-1)/2;
            const float K2 = 0.211324865; // (3-sqrt(3))/6;
            vec2 i = floor(p + (p.x + p.y) * K1);
            vec2 a = p - i + (i.x + i.y) * K2;
            float m = step(a.y, a.x);
            vec2 o = vec2(m, 1.0 - m);
            vec2 b = a - o + K2;
            vec2 c = a - 1.0 + 2.0 * K2;
            vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
            vec3 n = h * h * h * h * vec3(dot(a, hash(i + 0.0)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
            return dot(n, vec3(70.0));
        }

        float smoothNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float n = mix(mix(fract(sin(dot(i + vec2(0.0, 0.0), vec2(12.9898, 78.233))) * 43758.5453),
                              fract(sin(dot(i + vec2(1.0, 0.0), vec2(12.9898, 78.233))) * 43758.5453), f.x),
                          mix(fract(sin(dot(i + vec2(0.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453),
                              fract(sin(dot(i + vec2(1.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453), f.x), f.y);
            return n;
        }
        
        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 4; i++) {
                v += a * smoothNoise(p);
                p *= 2.0;
                a *= 0.5;
            }
            return v;
        }

        // --- Layer Specific Renderers ---
        
        // 0. Temperature
        vec4 renderTemperature(float isLand, float lat) {
          float absLat = abs(lat);
          float temp = 1.0 - pow(absLat, 1.2);
          float n1 = fbm(vUv * 8.0 + vec2(time * 0.05, 0.0));
          float n2 = fbm(vUv * 20.0 - vec2(time * 0.02, time * 0.01));
          temp = temp + (n1 * 0.2) + (n2 * 0.1) - 0.15;
          
          temp = mix(temp * 0.9, temp + 0.15, step(0.5, isLand));
          
          temp = clamp(temp, 0.0, 1.0);
          vec3 heat = getHeatmapColor(temp);
          float alpha = mix(opacity * 0.6, opacity, step(0.5, isLand));
          float edges = smoothstep(0.0, 0.15, temp) * smoothstep(1.0, 0.85, temp);
          return vec4(heat, alpha * (0.6 + 0.4 * edges));
        }

        // 1. Wind (Streamlines)
        vec4 renderWind(float lat, float isLand) {
           float isOcean = 1.0 - isLand;
           float absLat = abs(lat);
           
           // Smooth global bands
           float eq = exp(-pow(lat * 5.0, 2.0)); // Equator
           float trade = -cos(lat * 3.14159 * 2.5) * smoothstep(0.0, 0.4, absLat) * smoothstep(0.8, 0.4, absLat);
           float westerly = sin(lat * 3.14159 * 3.0) * smoothstep(0.3, 0.6, absLat) * smoothstep(0.9, 0.6, absLat);
           float polar = -sin(lat * 3.14159 * 4.0) * smoothstep(0.7, 1.0, absLat);
           
           float baseU = trade * 1.2 + westerly * 1.5 + polar * 0.8 - eq * 0.5;
           float baseV = sin(lat * 3.14159 * 6.0) * 0.1;

           // Multi-octave curl noise for turbulent wind structures
           float eps = 0.005;
           vec2 p0 = vUv * 4.0 - vec2(time * 0.02, 0.0);
           float n1 = fbm(p0);
           float dfdx1 = (fbm(p0 + vec2(eps, 0.0)) - n1) / eps;
           float dfdy1 = (fbm(p0 + vec2(0.0, eps)) - n1) / eps;
           
           vec2 p1 = vUv * 8.0 + vec2(time * 0.05, time * 0.02);
           float n2 = fbm(p1);
           float dfdx2 = (fbm(p1 + vec2(eps, 0.0)) - n2) / eps;
           float dfdy2 = (fbm(p1 + vec2(0.0, eps)) - n2) / eps;

           vec2 p2 = vUv * 16.0 - vec2(0.0, time * 0.1);
           float n3 = fbm(p2);
           float dfdx3 = (fbm(p2 + vec2(eps, 0.0)) - n3) / eps;
           float dfdy3 = (fbm(p2 + vec2(0.0, eps)) - n3) / eps;

           vec2 curlV = vec2(-dfdy1, dfdx1) * 0.15 + vec2(-dfdy2, dfdx2) * 0.08 + vec2(-dfdy3, dfdx3) * 0.04;
           
           // Explicit large cyclones
           vec2 c1 = vec2(0.3, 0.65);
           vec2 d1 = vUv - c1;
           d1.x *= max(0.1, cos((vUv.y - 0.5) * 3.14159)) * 2.0;
           float dist1 = length(d1);
           float cyc1 = exp(-pow(dist1 * 8.0, 2.0));
           vec2 cyc1V = vec2(-d1.y, d1.x) / (dist1 + 0.01) * cyc1 * 2.0;
           
           vec2 c2 = vec2(0.7, 0.35);
           vec2 d2 = vUv - c2;
           d2.x *= max(0.1, cos((vUv.y - 0.5) * 3.14159)) * 2.0;
           float dist2 = length(d2);
           float cyc2 = exp(-pow(dist2 * 10.0, 2.0));
           vec2 cyc2V = vec2(d2.y, -d2.x) / (dist2 + 0.01) * cyc2 * 2.5;

           // Combine winds
           vec2 windV = vec2(baseU, baseV) * 0.4 + curlV * 2.0 + cyc1V + cyc2V;
           
           // Boost wind over ocean
           windV *= mix(0.7, 1.4, isOcean);
           windV *= uWindSpeedIntensity;
           
           float speed = length(windV);
           float maxSpeed = 1.8;
           float normSpeed = clamp(speed / maxSpeed, 0.0, 1.0);
           
           vec2 dir = speed > 0.001 ? windV / speed : vec2(1.0, 0.0);
           float cosLat = max(0.1, cos((vUv.y - 0.5) * 3.14159));
           vec2 uniformUV = vec2(vUv.x * cosLat, vUv.y);
           vec2 perp = vec2(-dir.y, dir.x);
           
           // Multi-layered high-density streamlines
           float density = mix(200.0, 1000.0, uWindParticleDensity);
           
           // Layer 1 (Thick, long)
           float l1 = dot(uniformUV * density * 0.5, perp) + fbm(uniformUV * 10.0) * 3.0;
           float sid1 = floor(l1);
           float ph1 = noise(vec2(sid1, sid1));
           float f1 = fract(dot(uniformUV * 15.0, dir) - time * 3.0 * (0.8 + 0.4 * ph1) + ph1 * 20.0);
           float a1 = smoothstep(0.1, 0.5, f1) * smoothstep(1.0, 0.7, f1) * smoothstep(0.15, 0.0, abs(fract(l1) - 0.5)) * 0.8;
           
           // Layer 2 (Thin, fast)
           float l2 = dot(uniformUV * density, perp) + fbm(uniformUV * 25.0) * 5.0;
           float sid2 = floor(l2);
           float ph2 = noise(vec2(sid2 * 1.5, sid2 * 1.5));
           float f2 = fract(dot(uniformUV * 35.0, dir) - time * 8.0 * (0.8 + 0.4 * ph2) + ph2 * 20.0);
           float a2 = smoothstep(0.1, 0.5, f2) * smoothstep(1.0, 0.8, f2) * smoothstep(0.2, 0.0, abs(fract(l2) - 0.5)) * 1.0;
           
           // Layer 3 (Ultra fine, ultra fast particles for high wind areas)
           float l3 = dot(uniformUV * density * 2.0, perp) + fbm(uniformUV * 50.0) * 8.0;
           float sid3 = floor(l3);
           float ph3 = noise(vec2(sid3 * 2.5, sid3 * 2.5));
           float f3 = fract(dot(uniformUV * 60.0, dir) - time * 15.0 * (0.8 + 0.4 * ph3) + ph3 * 20.0);
           float a3 = smoothstep(0.2, 0.4, f3) * smoothstep(0.8, 0.6, f3) * smoothstep(0.3, 0.0, abs(fract(l3) - 0.5)) * 1.5 * smoothstep(0.4, 0.8, normSpeed); // Only in high wind

           float particleAlpha = max(max(a1, a2), a3);
           particleAlpha *= smoothstep(0.02, 0.15, normSpeed); // Fade in low wind areas
           
           vec3 col1 = vec3(0.0, 0.0, 0.5); // Deep Blue
           vec3 col2 = vec3(0.0, 1.0, 1.0); // Cyan
           vec3 col3 = vec3(0.0, 1.0, 0.0); // Green
           vec3 col4 = vec3(1.0, 1.0, 0.0); // Yellow
           vec3 col5 = vec3(1.0, 0.5, 0.0); // Orange
           vec3 col6 = vec3(1.0, 0.0, 0.0); // Red
           vec3 col7 = vec3(1.0, 0.0, 0.5); // Pink
           
           vec3 col = col1;
           if (normSpeed < 0.16) col = mix(col1, col2, normSpeed / 0.16);
           else if (normSpeed < 0.33) col = mix(col2, col3, (normSpeed - 0.16) / 0.17);
           else if (normSpeed < 0.50) col = mix(col3, col4, (normSpeed - 0.33) / 0.17);
           else if (normSpeed < 0.66) col = mix(col4, col5, (normSpeed - 0.50) / 0.16);
           else if (normSpeed < 0.83) col = mix(col5, col6, (normSpeed - 0.66) / 0.17);
           else col = mix(col6, col7, (normSpeed - 0.83) / 0.17);
           
           // Glow in high speed
           col += vec3(1.0, 0.8, 0.6) * smoothstep(0.85, 1.0, normSpeed) * 0.8;
           
           float vectorAlpha = uWindShowStreamlines * particleAlpha * uWindOpacity;
           
           // Base vector field visibility (blending the overall flow map)
           float baseAlpha = uWindVectorVisibility * smoothstep(0.0, 0.8, normSpeed) * 0.4 * uWindOpacity;
           
           float finalAlpha = clamp(vectorAlpha * 3.0 + baseAlpha, 0.0, 1.0);
           
           return vec4(col, finalAlpha * opacity);
        }

        // 2. Rainfall
        vec4 renderRainfall() {
           float rainDens = fbm(vUv * 12.0 + time * 0.08) * fbm(vUv * 25.0 - time * 0.1);
           rainDens = smoothstep(0.3, 0.8, rainDens);
           vec3 rainCol = mix(vec3(0.1, 0.4, 0.9), vec3(0.4, 0.8, 1.0), rainDens);
           return vec4(rainCol, rainDens * opacity * 1.5);
        }

        // 3. Clouds (Procedural enhanced)
        vec4 renderClouds() {
           float c = fbm(vUv * 15.0 + time * 0.03) * fbm(vUv * 8.0 - time * 0.01);
           c = smoothstep(0.2, 0.7, c);
           return vec4(vec3(1.0), c * opacity);
        }

        // 4. Humidity
        vec4 renderHumidity(float lat) {
           float hum = fbm(vUv * 6.0 + time * 0.01) * (1.0 - abs(lat) * 0.8);
           hum = smoothstep(0.2, 0.9, hum);
           vec3 col = mix(vec3(0.2, 0.8, 1.0), vec3(0.0, 0.3, 0.8), hum);
           return vec4(col, hum * opacity * 1.2);
        }

        // 5. Pressure
        vec4 renderPressure() {
           float p = fbm(vUv * 5.0 - time * 0.02);
           float isobars = fract(p * 20.0);
           float line = smoothstep(0.1, 0.0, abs(isobars - 0.5));
           vec3 pCol = mix(vec3(0.6, 0.2, 0.8), vec3(0.2, 0.8, 0.4), p);
           float a = (p * 0.5 + line * 0.8) * opacity;
           return vec4(pCol, a);
        }

        // 6. Air Quality
        vec4 renderAirQuality(float isLand) {
           float aq = fbm(vUv * 20.0 + time * 0.01) * isLand;
           aq = smoothstep(0.3, 0.8, aq);
           vec3 aqCol = mix(vec3(0.8, 0.8, 0.2), vec3(0.9, 0.3, 0.1), aq);
           return vec4(aqCol, aq * opacity);
        }

        // 7. Storms (Vortex/Cyclones)
        vec4 renderStorms() {
           // Create a massive cyclone effect using polar math
           vec2 center = vec2(0.7, 0.6); // Approximate cyclone center
           vec2 d = vUv - center;
           
           // Account for equirectangular projection stretching
           float cosLat = max(0.1, cos((vUv.y - 0.5) * 3.14159));
           d.x *= cosLat * 2.0;

           float dist = length(d);
           float angle = atan(d.y, d.x);
           float spiral = sin(angle * 4.0 - dist * 40.0 + time * 5.0);
           float eye = smoothstep(0.0, 0.02, dist) * smoothstep(0.15, 0.05, dist);
           
           float stormIntensity = max(0.0, spiral * eye);
           // Second storm
           vec2 center2 = vec2(0.3, 0.3);
           vec2 d2 = vUv - center2;
           d2.x *= cosLat * 2.0;
           float dist2 = length(d2);
           float angle2 = atan(d2.y, d2.x);
           float spiral2 = sin(angle2 * 5.0 + dist2 * 30.0 + time * 4.0);
           float eye2 = smoothstep(0.0, 0.03, dist2) * smoothstep(0.2, 0.08, dist2);
           stormIntensity += max(0.0, spiral2 * eye2);

           vec3 col = mix(vec3(0.4, 0.4, 0.4), vec3(1.0, 1.0, 1.0), stormIntensity);
           
           // Occasional lightning flash
           float flash = step(0.98, fract(sin(time * 10.0 + dist * 50.0) * 43758.5453));
           col += vec3(0.8, 0.9, 1.0) * flash * eye * 2.0;

           return vec4(col, stormIntensity * opacity * 2.5);
        }

        // 8. Snow & Ice
        vec4 renderSnow(float isLand, float lat) {
           float snowDens = fbm(vUv * 30.0) * smoothstep(0.4, 0.8, abs(lat) + 0.2);
           snowDens *= isLand;
           return vec4(vec3(1.0, 1.0, 1.0), snowDens * opacity * 1.5);
        }

        // 9. UV Index
        vec4 renderUV(float lat) {
           float sunPos = fract(time * 0.05); // Moving sun over the day
           float distToSunX = abs(vUv.x - sunPos);
           distToSunX = min(distToSunX, 1.0 - distToSunX); // wrap
           float distToSun = length(vec2(distToSunX * 2.0, lat));
           float uvIntensity = smoothstep(0.6, 0.0, distToSun);
           vec3 uvCol = mix(vec3(1.0, 0.8, 0.0), vec3(0.8, 0.0, 0.8), uvIntensity);
           return vec4(uvCol, uvIntensity * opacity);
        }

        // 10. Ocean Current
        vec4 renderOceanCurrent(float isOcean) {
           float flow = fbm(vUv * 10.0 + vec2(time * 0.05, time * 0.02));
           float stream = smoothstep(0.9, 0.98, sin(flow * 20.0));
           vec3 col = mix(vec3(0.0, 0.1, 0.3), vec3(0.1, 0.6, 1.0), stream);
           return vec4(col, stream * isOcean * opacity * 1.5);
        }

        // 11. Earthquakes (Seismic)
        vec4 renderEarthquakes(float isLand) {
           // Voronoi-like pulsing spots
           vec2 p = vUv * 15.0;
           vec2 i = floor(p);
           vec2 f = fract(p);
           float minDist = 1.0;
           vec2 bestPoint;
           for(int y = -1; y <= 1; ++y) {
               for(int x = -1; x <= 1; ++x) {
                   vec2 neighbor = vec2(float(x), float(y));
                   vec2 point = vec2(noise(i + neighbor), noise(i + neighbor + vec2(10.0)));
                   vec2 diff = neighbor + point - f;
                   float dist = length(diff);
                   if(dist < minDist) {
                       minDist = dist;
                       bestPoint = point;
                   }
               }
           }
           
           float seismic = smoothstep(0.1, 0.0, minDist);
           float pulse = sin(time * 8.0 + bestPoint.x * 100.0) * 0.5 + 0.5;
           seismic *= pulse * isLand;
           return vec4(vec3(1.0, 0.2, 0.0), seismic * opacity * 2.0);
        }

        void main() {
          float isOcean = texture2D(specularMap, vUv).r;
          float isLand = 1.0 - isOcean;
          float lat = (vUv.y - 0.5) * 2.0;
          
          vec4 finalColor = vec4(0.0);

          if (uLayerIndex == 0) finalColor = renderTemperature(isLand, lat);
          else if (uLayerIndex == 1) finalColor = renderWind(lat, isLand);
          else if (uLayerIndex == 2) finalColor = renderRainfall();
          else if (uLayerIndex == 3) finalColor = renderClouds();
          else if (uLayerIndex == 4) finalColor = renderHumidity(lat);
          else if (uLayerIndex == 5) finalColor = renderPressure();
          else if (uLayerIndex == 6) finalColor = renderAirQuality(isLand);
          else if (uLayerIndex == 7) finalColor = renderStorms();
          else if (uLayerIndex == 8) finalColor = renderSnow(isLand, lat);
          else if (uLayerIndex == 9) finalColor = renderUV(lat);
          else if (uLayerIndex == 10) finalColor = renderOceanCurrent(isOcean);
          else if (uLayerIndex == 11) finalColor = renderEarthquakes(isLand);

          gl_FragColor = finalColor;
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    };
  }, [specularMap, heatmapLUT, heatmapOpacity]);

  const onMaterialCompile = useMemo(() => (shader: any) => commonVertexModifier(shader, shadersRef), []);

  useEffect(() => {
    if (selectedLocationId) {
      const loc = locations.find(l => l.id === selectedLocationId);
      if (loc) {
        let pos;
        if (viewMode === 'map') {
            pos = calcMapPosFromLatLon(loc.lat, loc.lng, 4.0);
        } else {
            pos = calcPosFromLatLonRad(loc.lat, loc.lng, 4.0);
        }
        targetPos.current.copy(pos);
        isAnimating.current = true;
      }
    }
  }, [selectedLocationId, locations, viewMode]);

  useFrame(({ camera, clock }) => {
    const elapsedTime = clock.getElapsedTime();
    
    // Transition logic
    const targetRatio = viewMode === 'map' ? 1 : 0;
    if (Math.abs(projectionRatioRef.current - targetRatio) > 0.001) {
       projectionRatioRef.current += (targetRatio - projectionRatioRef.current) * 0.05;
       if (controlsRef.current) {
          controlsRef.current.enablePan = viewMode === 'map';
          if (viewMode === 'map' && prevViewMode.current === 'globe') {
             // Reset rotation when shifting to map
             controlsRef.current.target.lerp(new THREE.Vector3(0,0,0), 0.05);
             camera.position.lerp(new THREE.Vector3(0,0, 6), 0.05);
          }
       }
    } else {
       projectionRatioRef.current = targetRatio;
       prevViewMode.current = viewMode;
    }
    
    shadersRef.current.forEach(shader => {
       if (shader.uniforms.projectionRatio) {
          shader.uniforms.projectionRatio.value = projectionRatioRef.current;
       }
    });

    if (tempMaterialRef.current) {
         tempMaterialRef.current.visible = true;
         tempMaterialRef.current.uniforms.time.value = elapsedTime;
         tempMaterialRef.current.uniforms.opacity.value = heatmapOpacity;
         tempMaterialRef.current.uniforms.projectionRatio.value = projectionRatioRef.current;
         tempMaterialRef.current.uniforms.uLayerIndex.value = layerTypeMap[activeLayer] !== undefined ? layerTypeMap[activeLayer] : 0;
         
         tempMaterialRef.current.uniforms.uWindShowStreamlines.value = windOptions.showStreamlines ? 1.0 : 0.0;
         tempMaterialRef.current.uniforms.uWindParticleDensity.value = windOptions.particleDensity;
         tempMaterialRef.current.uniforms.uWindSpeedIntensity.value = windOptions.speedIntensity;
         tempMaterialRef.current.uniforms.uWindVectorVisibility.value = windOptions.vectorVisibility ? 1.0 : 0.0;
         tempMaterialRef.current.uniforms.uWindOpacity.value = windOptions.opacity;
    }
    
    if (cloudsRef.current) {
      // Don't rotate clouds in map mode
      if (viewMode === 'globe') cloudsRef.current.rotation.y = elapsedTime * 0.02;
      else cloudsRef.current.rotation.y = 0;
    }

    if (ringRef.current) {
      const scale = 1 + Math.sin(elapsedTime * 4) * 0.2;
      ringRef.current.scale.set(scale, scale, scale);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(elapsedTime * 4) * 0.5;
    }

    if (isAnimating.current && controlsRef.current && selectedLocationId) {
       camera.position.lerp(targetPos.current, 0.05);
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
        <mesh receiveShadow castShadow>
          <sphereGeometry args={[2, 128, 128]} />
          {mapType === 'satellite' ? (
            <meshStandardMaterial
              map={activeMap}
              normalMap={normalMap}
              roughnessMap={specularMap}
              roughness={0.8}
              metalness={0.1}
              onBeforeCompile={onMaterialCompile}
            />
          ) : (
            <meshBasicMaterial map={activeMap} onBeforeCompile={onMaterialCompile} />
          )}
        </mesh>

        <mesh>
          <sphereGeometry args={[2.005, 128, 128]} />
          <shaderMaterial ref={tempMaterialRef} args={[atmosphereShaderArgs]} />
        </mesh>

        {activeLayer === 'clouds' && (
          <mesh ref={cloudsRef}>
            <sphereGeometry args={[2.02, 128, 128]} />
            <meshPhongMaterial
              map={cloudsMap}
              transparent={true}
              opacity={0.8}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              onBeforeCompile={onMaterialCompile}
            />
          </mesh>
        )}

        {/* Global Warming Overlay */}
        {climateFactors.globalWarming && (
          <mesh>
            <sphereGeometry args={[2.02, 128, 128]} />
            <meshBasicMaterial color="#EF4444" transparent opacity={0.3} blending={THREE.AdditiveBlending} onBeforeCompile={onMaterialCompile} />
          </mesh>
        )}

        {/* Sea Level Rise Overlay */}
        {climateFactors.seaLevelRise && (
          <mesh>
            <sphereGeometry args={[2.015, 128, 128]} />
            <meshBasicMaterial color="#22D3EE" transparent opacity={0.6} blending={THREE.NormalBlending} onBeforeCompile={onMaterialCompile} />
          </mesh>
        )}

        <mesh>
          <sphereGeometry args={[2.05, 128, 128]} />
          <meshBasicMaterial
            color={
              climateFactors.globalWarming ? '#FB923C' :
              activeLayer === 'temperature' ? '#EF4444' :
              activeLayer === 'humidity' ? '#2563EB' :
              activeLayer === 'pressure' ? '#8B5CF6' :
              activeLayer === 'rainfall' ? '#3B82F6' :
              activeLayer === 'air_quality' ? '#CA8A04' :
              activeLayer === 'storms' ? '#6B7280' :
              activeLayer === 'snow' ? '#F3F4F6' :
              activeLayer === 'uv_index' ? '#EAB308' :
              activeLayer === 'earthquakes' ? '#DC2626' :
              '#38BDF8'
            }
            transparent
            opacity={climateFactors.globalWarming ? 0.35 : activeLayer === 'clouds' ? 0.15 : 0.25}
            blending={THREE.AdditiveBlending}
            side={THREE.BackSide}
            onBeforeCompile={onMaterialCompile}
          />
        </mesh>

        {locations.map((loc) => {
          const globePos = calcPosFromLatLonRad(loc.lat, loc.lng);
          const mapPos = calcMapPosFromLatLon(loc.lat, loc.lng);
          
          return (
            <PosTransitionalGroup key={loc.id} globePos={globePos} mapPos={mapPos} projectionRatioRef={projectionRatioRef}>
              <mesh onClick={(e) => { e.stopPropagation(); onLocationClick(loc); }}>
                <sphereGeometry args={[0.03, 16, 16]} />
                <meshBasicMaterial color={selectedLocationId === loc.id ? "#FB923C" : "#22D3EE"} />
                <Html distanceFactor={15}>
                  <div 
                    className={`text-[9px] font-mono font-medium -translate-x-1/2 mt-1 drop-shadow-md cursor-pointer transition-colors ${
                      selectedLocationId === loc.id ? "text-[#FB923C] scale-110" : "text-[#22D3EE] hover:text-white"
                    }`}
                    onClick={(e) => { e.stopPropagation(); onLocationClick(loc); }}
                  >
                    {loc.name}
                  </div>
                </Html>
              </mesh>
              {selectedLocationId === loc.id && (
                <mesh ref={ringRef}>
                  <ringGeometry args={[0.04, 0.05, 32]} />
                  <meshBasicMaterial color="#FB923C" transparent opacity={0.8} side={THREE.DoubleSide} />
                </mesh>
              )}
            </PosTransitionalGroup>
          );
        })}
      </group>

      <OrbitControls
        ref={controlsRef}
        enablePan={viewMode === 'map'}
        enableZoom={true}
        minDistance={1.0}
        maxDistance={12}
        rotateSpeed={0.5}
        autoRotate={viewMode === 'globe' && !selectedLocationId && !isAnimating.current}
        autoRotateSpeed={0.5}
      />
    </>
  );
}

function PosTransitionalGroup({ children, globePos, mapPos, projectionRatioRef }: any) {
    const ref = useRef<THREE.Group>(null);
    useFrame(() => {
        if (ref.current) {
            ref.current.position.lerpVectors(globePos, mapPos, projectionRatioRef.current);
        }
    });
    return <group ref={ref}>{children}</group>;
}
