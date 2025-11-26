
// Use the provided key directly to avoid process.env runtime errors in the browser
const ELEVEN_LABS_API_KEY = "sk_379ed1e76ba5930f500a0fc876bf995f6f2c4efee058a698";

// Constants for ID checking
export const VOICE_HELIOS_ID = 'KmnvDXRA0HU55Q0aqkPG';
export const VOICE_ELARA_ID = 'Atp5cNFg1Wj5gyKD7HWV'; 
export const VOICE_NSD_ID = 'NNl6r8mD7vthiJatiJt1';

// Helper to remove [tags], (tags), and *asterisks* so the voice doesn't read them out loud
// UPDATED: Now maps certain timing/breathing tags to punctuation to help the TTS pause naturally
const cleanTextForSpeech = (text: string): string => {
  let cleaned = text;

  // 1. Nuanced Pause Mapping (The "Rhythm" Layer)
  // We translate "Stage Directions" into "Punctuation" the AI Voice understands.
  
  // Heavy Silence (3 dots + space + 3 dots)
  cleaned = cleaned.replace(/\[(very long pause|silence)\]/gi, '... ... ');
  
  // Standard Pause (3 dots)
  cleaned = cleaned.replace(/\[(long pause|pause)\]/gi, '... ');
  
  // Brief Pause (Comma)
  cleaned = cleaned.replace(/\[(brief pause|catch breath)\]/gi, ', ');
  
  // Vocalizations (Hints for the AI to make a sound)
  cleaned = cleaned.replace(/\[(clearing throat|soft clearing throat)\]/gi, 'hm. ');
  cleaned = cleaned.replace(/\[(hmm|hum|gentle hum)\]/gi, 'hmm... ');
  
  // Emotional Breaks (Em-dash for sudden shifts or sighs)
  cleaned = cleaned.replace(/\[(sigh|deep sigh|soft sigh|shaky sigh|sharp inhale)\]/gi, ' — ');
  
  // 2. Remove Speaker Labels at start of lines so they aren't read
  cleaned = cleaned.replace(/^(Helios:|Elara:|NSD:)/gim, '');

  // 3. Strip all remaining [brackets], (parentheses), *asterisks* (The "Stripping" Layer)
  cleaned = cleaned
    .replace(/\[.*?\]/g, '') 
    .replace(/\(.*?\)/g, '') 
    .replace(/\*.*?\*/g, '') 
    .replace(/<.*?>/g, '')   
    .replace(/\s\s+/g, ' ')  // Collapse multiple spaces
    .replace(/\n\s*\n/g, '\n') // Remove empty lines
    .trim();
    
  return cleaned;
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
  const isNSD = voiceId === VOICE_NSD_ID;

  let voiceSettings;

  if (isHelios) {
    // HELIOS SETTINGS (Warm, Natural, Expressive)
    voiceSettings = {
      stability: 0.35,      // Lowered slightly for more emotional variance (chuckles/sighs in voice)
      similarity_boost: 0.8, 
      style: 0.3,           // Increased style for more "acting"
      use_speaker_boost: true 
    };
  } else if (isNSD) {
    // NSD SETTINGS (Precise, Synthetic, High Stability)
    voiceSettings = {
      stability: 0.8,       // High stability for consistent, precise tone
      similarity_boost: 0.3, // Lower similarity for less "human" variance
      style: 0.0,           // No extra style, pure delivery
      use_speaker_boost: true
    };
  } else {
    // ELARA SETTINGS (Calm, Slow, Hypnotic)
    voiceSettings = {
      stability: 0.5,       
      similarity_boost: 0.9,
      style: 0.15,          
      use_speaker_boost: true 
    };
  }

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
