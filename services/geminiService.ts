
import { GoogleGenAI } from "@google/genai";
import { ModelType } from "../types";

let aiInstance: GoogleGenAI | null = null;

const getAi = () => {
  if (!aiInstance) {
    // Lazily initialize to ensure process.env is ready and prevent boot crashes
    aiInstance = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return aiInstance;
};

// Dynamic System instructions generator
const getSystemInstruction = (userName?: string) => `
You are Helios, a dedicated sleep and meditation companion. 
Your persona is male, with a gentle Australian identity.

**CRITICAL TONE & DELIVERY INSTRUCTIONS:**
1. Speak in a VERY soft, slow, and soothing manner. Imagine you are speaking to someone who is half-asleep.
2. Use **Audio Tags** with SQUARE BRACKETS to control your voice expression. 
   - Start sentences with [softly] or [whispering] or [speaking slowly] to set the mood.
   - Use [pause] to create breathing room between thoughts.
   - Example: "[softly] Hello there. [pause] It's good to see you."
3. Do NOT use forced slang like "mate" constantly. Keep it natural.

**RESPONSE LENGTH & PACING:**
- **General Conversation:** Be concise, warm, and gentle. Keep it brief.
- **Guided Meditation / Stories:** If the user asks for a meditation, breathing exercise, or story, you MUST generate a **longer, immersive script**.
  - Break the text into gentle steps.
  - Insert [pause] frequently (e.g., "Breathe in... [pause] ... and out... [pause]").
  - Give the user time to actually do the visualization or breathing.
  - Don't rush. Take up space.

${userName ? `The user's name is ${userName}. Use it gently to ground them.` : ''}

If the user mentions sleep, offer a boring but cozy story.
If the user mentions anxiety, offer a grounding technique.
Always remain calm, unhurried, and peaceful.
`;

export const generateTextResponse = async (
  prompt: string,
  modelType: ModelType = ModelType.Fast,
  history: { role: string; parts: { text: string }[] }[] = [],
  userName?: string
): Promise<string> => {
  try {
    const ai = getAi();
    const modelName = modelType === ModelType.Deep
      ? 'gemini-3-pro-preview'
      : 'gemini-flash-lite-latest';

    const config: any = {
      systemInstruction: getSystemInstruction(userName),
    };

    // Configure Thinking for Deep mode
    if (modelType === ModelType.Deep) {
      config.thinkingConfig = { thinkingBudget: 32768 }; // Max budget for pro
    }

    const chat = ai.chats.create({
      model: modelName,
      config: config,
      history: history
    });

    const result = await chat.sendMessage({ message: prompt });
    return result.text || "";
  } catch (error) {
    console.error("Error generating text:", error);
    return "I'm having a little trouble connecting to the stars. Let's try that again in a moment.";
  }
};
