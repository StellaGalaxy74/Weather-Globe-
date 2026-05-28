import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes FIRST
  app.post("/api/global-summary", async (req, res) => {
    try {
      const { layer, warming, seaLevel } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      let contextStr = `Currently viewing the ${layer} layer. `;
      if (warming || seaLevel) {
        contextStr += `Active climate stressors: ${warming ? 'Global Warming' : ''} ${warming && seaLevel ? 'and' : ''} ${seaLevel ? 'Sea-level Rise' : ''}.`;
      } else {
        contextStr += `No extreme climate stressors are currently active.`;
      }

      const prompt = `You are the primary AI climate analyst for a global simulation dashboard.
Based on the current user view constraints:
${contextStr}

Provide a concise, highly professional summary (max 3 sentences) describing the probable global dynamics and potential anomalies visible in this simulation context. Keep it sounding like an advanced scientific forecasting system. Do not include introductory phrases like "Here is the summary" or "Based on the constraints".`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      res.json({ summary: response.text });
    } catch (error: any) {
      console.error('Error generating global summary:', error);
      res.status(500).json({ error: error.message || 'Failed to generate summary' });
    }
  });

  app.post("/api/weather-summary", async (req, res) => {
    try {
      const { name, temp, wind, humidity, aqi, condition, forecast } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      let forecastStr = '';
      if (forecast && forecast.length > 0) {
        forecastStr = `\n- 5-Day Forecast: ` + forecast.map((f: any) => `${f.day} (${f.condition}, ${f.minTemp}°C to ${f.maxTemp}°C)`).join(', ');
      }

      const prompt = `You are an AI meteorologist for an advanced climate simulation dashboard.
Given the following real-time data for ${name}, provide a professional and slightly futuristic weather analysis and forecast (max 3 sentences). Include a brief AI forecast of the upcoming days based on the provided data.

Data:
- Temperature: ${temp}°C
- Wind: ${wind} km/h
- Humidity: ${humidity}%
- AQI: ${aqi}
- Condition: ${condition}${forecastStr}

Keep it brief and focus on the immediate atmospheric implications and the upcoming forecast.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      res.json({ summary: response.text });
    } catch (error: any) {
      console.error('Error generating summary:', error);
      res.status(500).json({ error: error.message || 'Failed to generate summary' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
