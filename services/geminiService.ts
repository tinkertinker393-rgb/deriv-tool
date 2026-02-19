
import { GoogleGenAI, Type } from "@google/genai";
import { AIAnalysis } from "../types";

export const analyzeMarketPatterns = async (
  ticks: { quote: number, lastDigit: number }[],
  symbol: string
): Promise<AIAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
  
  const lastDigits = ticks.map(t => t.lastDigit);
  const quotes = ticks.map(t => t.quote);
  
  const digitFreq = lastDigits.reduce((acc, d) => {
    acc[d] = (acc[d] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const prompt = `
    System Instruction: You are a high-frequency trading (HFT) quant expert specializing in Deriv Synthetic Indices.
    Task: Provide ultra-precise "MATCHES" digit prediction and "Rise/Fall" signals.
    
    Data Context for ${symbol}:
    - Tick History (Last 100): ${lastDigits.join(", ")}
    - Statistical Skew: ${JSON.stringify(digitFreq)}
    - Price Delta: Starting at ${quotes[0]}, ending at ${quotes[quotes.length - 1]}.
    
    Strategic Requirements:
    1. DIGIT MATCH: Identify the 'Hot Digit' (most likely to repeat within 1-2 ticks based on current momentum) OR the 'Overdue Digit' (statistically missing for >25 ticks). Pick the ONE with highest mathematical probability.
    2. SIGNAL: Analyze price velocity. If slope is sharply positive, signal STRONG BUY. If negative, STRONG SELL.
    3. BE CRITICAL: If patterns are noisy, return NEUTRAL.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            prediction: { type: Type.STRING },
            matchDigit: { type: Type.INTEGER },
            signal: { type: Type.STRING, enum: ["STRONG BUY", "BUY", "NEUTRAL", "SELL", "STRONG SELL"] },
            confidence: { type: Type.NUMBER },
            logic: { type: Type.STRING }
          },
          required: ["summary", "prediction", "matchDigit", "signal", "confidence", "logic"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("AI Analysis Error:", error);
    throw error;
  }
};
