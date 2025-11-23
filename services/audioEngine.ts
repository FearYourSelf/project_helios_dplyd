
export class AudioEngine {
  private context: AudioContext | null = null;
  
  // Master control
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;

  // Voice Pipeline
  private voiceAnalyser: AnalyserNode | null = null;
  private currentSource: AudioBufferSourceNode | null = null; // Track active speech source
  
  // Microphone Pipeline (User Voice)
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micAnalyser: AnalyserNode | null = null;

  // Ambient Pipeline (Generative Music)
  private musicVolumeNode: GainNode | null = null;
  private ambientAnalyser: AnalyserNode | null = null;
  private reverbNode: ConvolverNode | null = null; // New Reverb
  private activeNodes: AudioNode[] = []; 
  private isAmbientPlaying: boolean = false;
  private melodyInterval: any = null;
  private musicVolume: number = 0.5; // Default music volume

  constructor() {
    // Initialize lazily
  }

  init() {
    if (typeof window === 'undefined') return;

    if (!this.context) {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Master Gain (Global Mute)
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 1.0;
      this.masterGain.connect(this.context.destination);

      // Reverb (Convolver) - Creates the "Space"
      this.reverbNode = this.context.createConvolver();
      this.createReverbImpulse(3.0); // 3 seconds reverb tail
      this.reverbNode.connect(this.masterGain);

      // Voice Analyser (Helios Output)
      this.voiceAnalyser = this.context.createAnalyser();
      this.voiceAnalyser.fftSize = 512; 
      this.voiceAnalyser.smoothingTimeConstant = 0.8;

      // Mic Analyser (User Input)
      this.micAnalyser = this.context.createAnalyser();
      this.micAnalyser.fftSize = 512;
      this.micAnalyser.smoothingTimeConstant = 0.8;

      // Music Volume Control
      this.musicVolumeNode = this.context.createGain();
      this.musicVolumeNode.gain.value = 0; // Start at 0 for fade in
      
      // Ambient Analyser (Visuals for music)
      this.ambientAnalyser = this.context.createAnalyser();
      this.ambientAnalyser.fftSize = 256;
      this.ambientAnalyser.smoothingTimeConstant = 0.9;

      // Chain: Music -> Analyser -> Volume -> Reverb -> Master
      this.musicVolumeNode.connect(this.ambientAnalyser);
      this.ambientAnalyser.connect(this.reverbNode);
      // Dry signal mixed in slightly? No, let's go full wet for ambient for now or mix
      this.ambientAnalyser.connect(this.masterGain); // Direct dry signal
    }
    
    if (this.context.state === 'suspended') {
      this.context.resume().catch(err => console.error("Audio resume failed", err));
    }
  }

  // Generate synthetic reverb impulse
  private createReverbImpulse(duration: number) {
    if (!this.context || !this.reverbNode) return;
    const rate = this.context.sampleRate;
    const length = rate * duration;
    const impulse = this.context.createBuffer(2, length, rate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
        // Exponential decay
        const n = i;
        const decay = Math.pow(1 - n / length, 2); 
        left[i] = (Math.random() * 2 - 1) * decay;
        right[i] = (Math.random() * 2 - 1) * decay;
    }
    this.reverbNode.buffer = impulse;
  }

  setMusicVolume(val: number) {
      this.musicVolume = val;
      if (this.musicVolumeNode && this.isAmbientPlaying) {
          // Smooth transition
          this.musicVolumeNode.gain.setTargetAtTime(val, this.context?.currentTime || 0, 0.5);
      }
  }

  toggleMute(shouldMute: boolean) {
    this.isMuted = shouldMute;
    if (this.masterGain && this.context) {
      const currentTime = this.context.currentTime;
      this.masterGain.gain.cancelScheduledValues(currentTime);
      this.masterGain.gain.setTargetAtTime(shouldMute ? 0 : 1, currentTime, 0.5);
    }
  }

  // Connect Microphone for Visualization
  async connectMicrophone() {
      this.init();
      if (!this.context || !this.micAnalyser) return;
      
      try {
        if (!this.micStream) {
            this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.micSource = this.context.createMediaStreamSource(this.micStream);
            this.micSource.connect(this.micAnalyser);
        }
      } catch (err) {
          console.warn("Could not connect microphone for visualization", err);
      }
  }

  disconnectMicrophone() {
      // We don't necessarily stop the stream to avoid permission prompts repeatedly,
      // but we could disconnect the nodes if needed. 
      // For now, we keep it active but the visualizer chooses when to look at it.
  }

  getVoiceAnalyser() { return this.voiceAnalyser; }
  getMicAnalyser() { return this.micAnalyser; }
  getAmbientAnalyser() { return this.ambientAnalyser; }

  async playSpeech(audioBuffer: ArrayBuffer) {
    this.init();
    if (!this.context || !this.masterGain || !this.voiceAnalyser) return;

    // Stop any currently playing speech to avoid overlap
    this.stopSpeech();

    try {
        const buffer = await this.context.decodeAudioData(audioBuffer);
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        this.currentSource = source; // Track current source
        
        source.connect(this.voiceAnalyser); 
        this.voiceAnalyser.connect(this.masterGain); // Voice is dry + crisp
        
        source.start(0);
        return new Promise((resolve) => {
            source.onended = () => {
                if (this.currentSource === source) {
                    this.currentSource = null;
                }
                resolve(null);
            };
        });
    } catch (e) {
        console.error("Error decoding audio data", e);
    }
  }

  stopSpeech() {
      if (this.currentSource) {
          try {
            this.currentSource.stop();
          } catch (e) {
              // Ignore errors if already stopped
          }
          this.currentSource = null;
      }
  }

  toggleAmbient(enable: boolean) {
    this.init();
    if (enable && !this.isAmbientPlaying) {
      this.startNewAgeMusic();
    } else if (!enable && this.isAmbientPlaying) {
      this.stopGenerativeMusic();
    }
  }

  private startNewAgeMusic() {
    if (!this.context || !this.musicVolumeNode) return;
    this.context.resume();

    this.isAmbientPlaying = true;

    // Smooth Fade In (3 seconds)
    const now = this.context.currentTime;
    this.musicVolumeNode.gain.cancelScheduledValues(now);
    this.musicVolumeNode.gain.setValueAtTime(0, now);
    this.musicVolumeNode.gain.linearRampToValueAtTime(this.musicVolume, now + 3);

    // Scale: D Major Pentatonic (D, E, F#, A, B) - Very positive and dreamy
    // Lower octave for pads, higher for bells
    const scale = [146.83, 164.81, 185.00, 220.00, 246.94, 293.66, 329.63, 369.99];

    // --- LAYER 1: The "Drone" (Deep Pad) ---
    // Uses 3 oscillators slightly detuned for thickness
    const droneFreqs = [73.42, 110.00]; // D2, A2
    droneFreqs.forEach(freq => {
        const osc = this.context!.createOscillator();
        osc.type = 'sine'; // Pure sine for deep bass
        osc.frequency.value = freq;
        
        const gain = this.context!.createGain();
        gain.gain.value = 0.1; // Low volume base

        osc.connect(gain);
        gain.connect(this.musicVolumeNode!);
        osc.start();
        this.activeNodes.push(osc, gain);
    });

    // --- LAYER 2: Swelling Chords (The "Pad") ---
    const playSwell = () => {
        if (!this.isAmbientPlaying || !this.context) return;
        
        // Pick 2 notes from scale
        const n1 = scale[Math.floor(Math.random() * 4)];
        const n2 = scale[Math.floor(Math.random() * 4) + 2];

        [n1, n2].forEach(freq => {
             const osc = this.context!.createOscillator();
             osc.type = 'triangle';
             osc.frequency.value = freq;
             
             // Lowpass filter to make it "underwater"
             const filter = this.context!.createBiquadFilter();
             filter.type = 'lowpass';
             filter.frequency.value = 400;

             const env = this.context!.createGain();
             env.gain.setValueAtTime(0, this.context!.currentTime);
             // Very slow attack (4s) and release (4s)
             env.gain.linearRampToValueAtTime(0.05, this.context!.currentTime + 4);
             env.gain.linearRampToValueAtTime(0, this.context!.currentTime + 10);

             osc.connect(filter);
             filter.connect(env);
             env.connect(this.musicVolumeNode!);

             osc.start();
             osc.stop(this.context!.currentTime + 10);
             
             setTimeout(() => {
                 osc.disconnect();
                 filter.disconnect();
                 env.disconnect();
             }, 10500);
        });
    };

    // --- LAYER 3: The "Bells" (Random melody) ---
    const playBell = () => {
        if (!this.isAmbientPlaying || !this.context) return;
        
        if (Math.random() > 0.3) { // 70% chance to play
            const freq = scale[Math.floor(Math.random() * scale.length)] * 2; // Higher octave
            
            const osc = this.context!.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const env = this.context!.createGain();
            env.gain.setValueAtTime(0, this.context!.currentTime);
            env.gain.linearRampToValueAtTime(0.05, this.context!.currentTime + 0.05); // Fast attack
            env.gain.exponentialRampToValueAtTime(0.001, this.context!.currentTime + 3); // Long ring

            osc.connect(env);
            env.connect(this.musicVolumeNode!);
            
            osc.start();
            osc.stop(this.context!.currentTime + 3.1);

            setTimeout(() => {
                osc.disconnect();
                env.disconnect();
            }, 3200);
        }
    };

    // Loop logic
    const loop = () => {
        if (!this.isAmbientPlaying) return;
        playSwell();
        // Play bell somewhere in the middle
        setTimeout(playBell, Math.random() * 2000);
        
        // Next loop in 6-8 seconds
        this.melodyInterval = setTimeout(loop, 6000 + Math.random() * 2000);
    };

    loop();
  }

  private stopGenerativeMusic() {
    if (this.melodyInterval) {
        clearTimeout(this.melodyInterval);
        this.melodyInterval = null;
    }
    
    // Smooth Fade Out (3 seconds)
    if (this.musicVolumeNode && this.context) {
        const now = this.context.currentTime;
        this.musicVolumeNode.gain.cancelScheduledValues(now);
        this.musicVolumeNode.gain.setValueAtTime(this.musicVolumeNode.gain.value, now);
        this.musicVolumeNode.gain.linearRampToValueAtTime(0, now + 3);
    }

    setTimeout(() => {
        this.activeNodes.forEach(node => {
            try { node.disconnect(); } catch(e){}
            try { (node as any).stop(); } catch(e){}
        });
        this.activeNodes = [];
        this.isAmbientPlaying = false;
    }, 3100); // Wait for fade out
  }
}

export const audioEngine = new AudioEngine();
