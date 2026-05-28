export type WeatherLayer = 'temperature' | 'humidity' | 'clouds' | 'pressure';
export type MapType = 'default' | 'satellite' | 'terrain';

export interface Location {
  id: string;
  name: string;
  lat: number;
  lng: number;
  temp: number;
  wind: number;
  humidity: number;
  aqi: number;
  condition: string;
  forecast?: { day: string; maxTemp: number; minTemp: number; condition: string }[];
}

export interface ClimateFactors {
  seaLevelRise: boolean;
  globalWarming: boolean;
}

export const MOCK_LOCATIONS: Location[] = [
  { id: '1', name: 'New York', lat: 40.7128, lng: -74.0060, temp: 18, wind: 12, humidity: 55, aqi: 42, condition: 'Clear' },
  { id: '2', name: 'London', lat: 51.5074, lng: -0.1278, temp: 12, wind: 18, humidity: 70, aqi: 35, condition: 'Rain' },
  { id: '3', name: 'Tokyo', lat: 35.6762, lng: 139.6503, temp: 22, wind: 8, humidity: 60, aqi: 65, condition: 'Partly Cloudy' },
  { id: '4', name: 'Sydney', lat: -33.8688, lng: 151.2093, temp: 26, wind: 15, humidity: 45, aqi: 20, condition: 'Sunny' },
  { id: '5', name: 'Dubai', lat: 25.2048, lng: 55.2708, temp: 35, wind: 10, humidity: 30, aqi: 85, condition: 'Clear' },
  { id: '6', name: 'Rio de Janeiro', lat: -22.9068, lng: -43.1729, temp: 28, wind: 14, humidity: 75, aqi: 40, condition: 'Thunderstorm' },
];
