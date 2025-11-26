
// Use the provided key directly to avoid process.env runtime errors in the browser
const ELEVEN_LABS_API_KEY = "sk_379ed1e76ba5930f500a0fc876bf995f6f2c4efee058a698";

// Constants for ID checking
export const VOICE_HELIOS_ID = 'KmnvDXRA0HU55Q0aqkPG';
export const VOICE_ELARA_ID = 'Atp5cNFg1Wj5gyKD7HWV'; 
export const VOICE_NSD_ID = 'NNl6r8mD7vthiJatiJt1';

// Helper to remove [tags], (tags), and *asterisks* so the voice doesn't read them out loud
// UPDATED: Now maps tags to SILENT PUNCTUATION for rhythm without phonetic artifacts
const cleanTextForSpeech = (text: string): string => {
  let cleaned = text;

  // --- 1. ACTION TRANSLATION LAYER (The "Acting" to "Rhythm" Converter) ---
  
  // A. HEAVY SILENCE & REFLECTION (3 dots + space + 3 dots)
  // Maps: [very long pause], [silence], [looking up at the stars], [distant]
  cleaned = cleaned.replace(/\[(very long pause|silence|distant|looking up|staring|waiting).*?\]/gi, '... ... ');
  
  // B. STANDARD PAUSE & PHYSICAL ACTIONS (3 dots)
  // Maps: [long pause], [pause], [rubbing eyes], [leaning back], [shifting weight]
  cleaned = cleaned.replace(/\[(long pause|pause|rubbing|leaning|shifting|stifling|rub|look|lean|shift|stifle).*?\]/gi, '... ');
  
  // C. EMOTIONAL BEATS (Silent Pauses)
  // We map these to simple ellipses or dashes to create space in the flow, allowing the "thought" to land.

  // Laughs -> Pause (Letting the humor sit)
  cleaned = cleaned.replace(/\[(chuckle|laugh|soft laugh|dry chuckle|wry|smile|smiling).*?\]/gi, '... ');
  
  // Sighs -> Break (A shift in flow)
  cleaned = cleaned.replace(/\[(sigh|deep sigh|soft sigh|shaky sigh|exhale|slow exhale).*?\]/gi, ' — ');
  
  // Thoughtful -> Pause
  cleaned = cleaned.replace(/\[(hmm|hum|gentle hum|thoughtful hum|thoughtful|considering).*?\]/gi, '... ');

  // Clearing throat -> Pause
  cleaned = cleaned.replace(/\[(clearing throat|soft clearing throat).*?\]/gi, '... ');

  // D. SHORT BREAKS
  // Maps: [brief pause], [catch breath], [sharp inhale] -> Comma
  cleaned = cleaned.replace(/\[(brief pause|catch breath|sharp inhale).*?\]/gi, ', ');
  
  // Maps: [swallow], [sniff] -> Dash (Break)
  cleaned = cleaned.replace(/\[(swallow|sniff|smack|tongue|wet).*?\]/gi, ' — ');

  // --- 2. STRUCTURAL CLEANUP ---
  
  // Remove Speaker Labels at start of lines
  cleaned = cleaned.replace(/^(Helios:|Elara:|NSD:)/gim, '');

  // Strip ALL remaining tags (Tone indicators like [softly], [gravelly] are stripped as they just guide the AI's word choice)
  cleaned = cleaned
    .replace(/\[.*?\]/g, '') 
    .replace(/\(.*?\)/g, '') 
    .replace(/\*.*?\*/g, '') 
    .replace(/<.*?>/g, '')   
    .replace(/\s\s+/g, ' ')  // Collapse multiple spaces
    .replace(/\.\.\.\s*\.\.\./g, '...') // Collapse multiple ellipses
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
    // HELIOS SETTINGS (Raw, Human, Variable)
    voiceSettings = {
      stability: 0.3,       // LOW stability = More emotion, more breathiness, more risk taking
      similarity_boost: 0.75, 
      style: 0.4,           // High style = More dramatic delivery
      use_speaker_boost: true 
    };
  } else if (isNSD) {
    // NSD SETTINGS (Precise, Synthetic)
    voiceSettings = {
      stability: 0.8,       
      similarity_boost: 0.3, 
      style: 0.0,           
      use_speaker_boost: true
    };
  } else {
    // ELARA SETTINGS (Fluid, Breath-heavy)
    voiceSettings = {
      stability: 0.4,       // Lowered for more natural modulation
      similarity_boost: 0.85, 
      style: 0.35,          // Increased style for "hypnotic" effect
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
