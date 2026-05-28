import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function AtmosphericGraph() {
  const [data, setData] = useState(
    Array.from({ length: 20 }, (_, i) => ({
      time: i,
      co2: 415 + Math.random() * 10,
      ozone: 280 + Math.random() * 10,
      temp: 1.1 + Math.random() * 0.2,
    }))
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setData((prevData) => {
        const newData = [...prevData.slice(1)];
        const last = newData[newData.length - 1];
        
        newData.push({
          time: last.time + 1,
          co2: last.co2 + (Math.random() - 0.45) * 2,
          ozone: last.ozone + (Math.random() - 0.5) * 2,
          temp: last.temp + (Math.random() - 0.45) * 0.05,
        });

        return newData;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md h-64">
      <h3 className="text-xs font-bold uppercase tracking-widest mb-4 opacity-70">Atmospheric Composition</h3>
      <div className="w-full h-full -ml-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
            <XAxis dataKey="time" hide />
            <YAxis 
              yAxisId="co2" 
              domain={['auto', 'auto']} 
              hide 
            />
            <YAxis 
              yAxisId="ozone" 
              domain={['auto', 'auto']} 
              hide 
            />
            <YAxis 
              yAxisId="temp" 
              domain={['auto', 'auto']} 
              hide 
            />
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
              itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
              labelStyle={{ display: 'none' }}
              formatter={(value: number, name: string) => {
                if (name === 'co2') return [`${value.toFixed(1)} ppm`, 'CO2'];
                if (name === 'ozone') return [`${value.toFixed(0)} DU`, 'Ozone'];
                if (name === 'temp') return [`+${value.toFixed(2)}° Δ`, 'Oceanic Temp'];
                return [value, name];
              }}
            />
            <Line yAxisId="co2" type="monotone" dataKey="co2" stroke="#EF4444" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line yAxisId="ozone" type="monotone" dataKey="ozone" stroke="#22D3EE" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line yAxisId="temp" type="monotone" dataKey="temp" stroke="#FB923C" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between mt-2 px-1 text-[10px] uppercase font-bold text-slate-400">
        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-[#EF4444] rounded-full"></div> CO2</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-[#22D3EE] rounded-full"></div> Ozone</span>
        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-[#FB923C] rounded-full"></div> Temp</span>
      </div>
    </div>
  );
}
