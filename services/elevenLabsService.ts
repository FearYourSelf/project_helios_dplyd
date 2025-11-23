
// Use the provided key directly to avoid process.env runtime errors in the browser
const ELEVEN_LABS_API_KEY = "sk_03d87b5aac167ccfc25390da1e7caed180dfd5aaaf1401a4";
const VOICE_ID = 'KmnvDXRA0HU55Q0aqkPG'; 

// Helper to remove [tags], (tags), and *asterisks* so the voice doesn't read them out loud
const cleanTextForSpeech = (text: string): string => {
  return text
    .replace(/\[.*?\]/g, '') // remove [brackets]
    .replace(/\(.*?\)/g, '') // remove (parentheses)
    .replace(/\*.*?\*/g, '') // remove *asterisks*
    .trim();
};

export const streamSpeech = async (text: string): Promise<ArrayBuffer | null> => {
  if (!ELEVEN_LABS_API_KEY) {
    console.error("Eleven Labs API Key is missing.");
    return null;
  }

  // Clean the text before sending it to the audio model
  const textToSpeak = cleanTextForSpeech(text);
  
  // If cleaning results in empty text (e.g. only had tags), don't call API
  if (!textToSpeak) return null;

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`,
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
          voice_settings: {
            stability: 0.35, 
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
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
