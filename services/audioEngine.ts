

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
  
  // Pink Noise (Texture)
  private pinkNoiseNode: AudioBufferSourceNode | null = null;
  private pinkNoiseGain: GainNode | null = null;
  
  private targetMusicVolume: number = 0.5; // The user-set volume
  private isDucked: boolean = false;       // Logic state

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
      this.voiceAnalyser.smoothingTimeConstant = 0.9; // Smoother visualizer

      // Mic Analyser (User Input)
      this.micAnalyser = this.context.createAnalyser();
      this.micAnalyser.fftSize = 512;
      this.micAnalyser.smoothingTimeConstant = 0.9; // Smoother visualizer

      // Music Volume Control
      this.musicVolumeNode = this.context.createGain();
      this.musicVolumeNode.gain.value = 0; // Start at 0 for fade in
      
      // Ambient Analyser (Visuals for music)
      this.ambientAnalyser = this.context.createAnalyser();
      this.ambientAnalyser.fftSize = 256;
      this.ambientAnalyser.smoothingTimeConstant = 0.95; // Even smoother for ambient

      // Pink Noise Setup
      this.pinkNoiseGain = this.context.createGain();
      this.pinkNoiseGain.gain.value = 0;
      this.pinkNoiseGain.connect(this.masterGain);

      // Chain: Music -> Analyser -> Volume -> Reverb -> Master
      this.musicVolumeNode.connect(this.ambientAnalyser);
      this.ambientAnalyser.connect(this.reverbNode);
      // Direct dry signal mix
      this.ambientAnalyser.connect(this.masterGain); 
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

  // Creates a loopable pink noise buffer (Rain texture)
  private startPinkNoise() {
      if (!this.context || !this.pinkNoiseGain) return;
      
      const bufferSize = 2 * this.context.sampleRate; // 2 seconds
      const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
      const output = buffer.getChannelData(0);
      let b0, b1, b2, b3, b4, b5, b6;
      b0 = b1 = b2 = b3 = b4 = b5 = b6 = 0.0;
      
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
        output[i] *= 0.11; // Compensate for gain
        b6 = white * 0.115926;
      }
      
      this.pinkNoiseNode = this.context.createBufferSource();
      this.pinkNoiseNode.buffer = buffer;
      this.pinkNoiseNode.loop = true;
      this.pinkNoiseNode.connect(this.pinkNoiseGain);
      this.pinkNoiseNode.start(0);
  }

  private stopPinkNoise() {
      if (this.pinkNoiseNode) {
          try {
             this.pinkNoiseNode.stop();
             this.pinkNoiseNode.disconnect();
          } catch(e) {}
          this.pinkNoiseNode = null;
      }
  }

  // Sets the base volume requested by user
  setMusicVolume(val: number) {
      this.targetMusicVolume = val;
      if (!this.isDucked) {
          this.applyVolume(val);
      }
      // Also adjust pink noise volume relative to music
      if (this.pinkNoiseGain && this.context) {
          // REDUCED VOLUME: 0.5% of master volume instead of 5%
          this.pinkNoiseGain.gain.setTargetAtTime(val * 0.005, this.context.currentTime, 0.5); 
      }
  }

  // Logic to apply volume smoothly
  private applyVolume(val: number, duration: number = 0.5) {
      if (this.musicVolumeNode && this.context) {
          this.musicVolumeNode.gain.setTargetAtTime(val, this.context.currentTime, duration);
      }
  }

  // Audio Ducking: Lowers music when AI speaks
  duckMusic(shouldDuck: boolean) {
      if (!this.isAmbientPlaying || !this.musicVolumeNode) return;
      
      this.isDucked = shouldDuck;
      
      // If ducking, go to 20% of target volume, else go back to full target
      const target = shouldDuck ? (this.targetMusicVolume * 0.2) : this.targetMusicVolume;
      
      // Use a slower ramp for unducking (swelling back up)
      const rampTime = shouldDuck ? 0.5 : 2.0; 
      this.applyVolume(target, rampTime);
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
      // Keep stream active to prevent permission prompts
  }

  getVoiceAnalyser() { return this.voiceAnalyser; }
  getMicAnalyser() { return this.micAnalyser; }
  getAmbientAnalyser() { return this.ambientAnalyser; }

  async playSpeech(audioBuffer: ArrayBuffer) {
    this.init();
    if (!this.context || !this.masterGain || !this.voiceAnalyser) return;

    // Stop any currently playing speech to avoid overlap
    this.stopSpeech();

    // Trigger Ducking
    this.duckMusic(true);

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
                    // Release Ducking
                    this.duckMusic(false);
                }
                resolve(null);
            };
        });
    } catch (e) {
        console.error("Error decoding audio data", e);
        this.duckMusic(false); // Safety release
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
          this.duckMusic(false); // Release ducking if manually stopped
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
    this.startPinkNoise();

    // Smooth Fade In (3 seconds)
    const now = this.context.currentTime;
    this.musicVolumeNode.gain.cancelScheduledValues(now);
    this.musicVolumeNode.gain.setValueAtTime(0, now);
    this.musicVolumeNode.gain.linearRampToValueAtTime(this.targetMusicVolume, now + 3);
    
    // Fade in pink noise
    if (this.pinkNoiseGain) {
        this.pinkNoiseGain.gain.setValueAtTime(0, now);
        this.pinkNoiseGain.gain.linearRampToValueAtTime(this.targetMusicVolume * 0.005, now + 5);
    }

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
    
    // Fade out pink noise
    if (this.pinkNoiseGain && this.context) {
        const now = this.context.currentTime;
        this.pinkNoiseGain.gain.linearRampToValueAtTime(0, now + 3);
    }

    setTimeout(() => {
        this.stopPinkNoise();
        this.activeNodes.forEach(node => {
            try { node.disconnect(); } catch(e){}
            try { (node as any).stop(); } catch(e){}
        });
        this.activeNodes = [];
        this.isAmbientPlaying = false;
        this.isDucked = false;
    }, 3100); // Wait for fade out
  }
}

export const audioEngine = new AudioEngine();