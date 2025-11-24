
// Use the provided key directly to avoid process.env runtime errors in the browser
const ELEVEN_LABS_API_KEY = "sk_046542254a371c7f36919091f1e0b665f5092595ddb452ad";

// Constants for ID checking
const VOICE_HELIOS_ID = 'KmnvDXRA0HU55Q0aqkPG';

// Helper to remove [tags], (tags), and *asterisks* so the voice doesn't read them out loud
const cleanTextForSpeech = (text: string): string => {
  return text
    .replace(/\[.*?\]/g, '') // remove [brackets]
    .replace(/\(.*?\)/g, '') // remove (parentheses)
    .replace(/\*.*?\*/g, '') // remove *asterisks*
    .trim();
};

export const streamSpeech = async (text: string, voiceId: string): Promise<ArrayBuffer | null> => {
  if (!ELEVEN_LABS_API_KEY) {
    console.error("Eleven Labs API Key is missing.");
    return null;
  }

  // Clean the text before sending it to the audio model
  const textToSpeak = cleanTextForSpeech(text);
  
  // If cleaning results in empty text (e.g. only had tags), don't call API
  if (!textToSpeak) return null;

  // Determine settings based on which voice is asking
  const isHelios = voiceId === VOICE_HELIOS_ID;

  const voiceSettings = isHelios ? {
    // HELIOS SETTINGS (Warm, Natural, Expressive)
    stability: 0.4,       // Lower stability = more emotion/variability
    similarity_boost: 0.8, 
    style: 0.2,           // Some style for natural Australian flow
    use_speaker_boost: true // Boost for clarity
  } : {
    // ELARA SETTINGS (Calm, Slow, Hypnotic)
    // Updated to Style 0.15 and Boost True to prevent silence on this specific Voice ID
    stability: 0.5,       
    similarity_boost: 0.9,
    style: 0.15,          // Slight style required for generation
    use_speaker_boost: true // Boost required for clarity on this model
  };

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVEN_LABS_API_KEY,
        },
        body: JSON.stringify({
          text: textToSpeak,
          model_id: "eleven_turbo_v2_5", 
          voice_settings: voiceSettings
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Eleven Labs API Error:", errorText);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return arrayBuffer;
  } catch (error) {
    console.error("Error streaming speech from Eleven Labs:", error);
    return null;
  }
};
