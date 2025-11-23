
import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../services/audioEngine';

export type VisualizerState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface VisualizerProps {
  state: VisualizerState;
  isAmbient: boolean;
  voiceType: 'helios' | 'elara';
}

const Visualizer: React.FC<VisualizerProps> = ({ state, isAmbient, voiceType }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Use Refs to store current interpolation values to persist between renders
  const currentRadiusRef = useRef(60);
  const currentHueRef = useRef(200);
  // Track background hue separately for smooth transitions between personas
  const currentBgHueRef = useRef(voiceType === 'helios' ? 210 : 260);
  const phaseRef = useRef(0);
  
  // Stardust state
  const starsRef = useRef<{x: number, y: number, size: number, speed: number, alpha: number}[]>([]);

  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // CRITICAL FIX: Set dimensions BEFORE generating stars
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Initialize stars if empty or if canvas size changed drastically
    if (starsRef.current.length === 0) {
        for(let i=0; i<100; i++) { // Increased count slightly
            starsRef.current.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2,
                speed: 0.1 + Math.random() * 0.3,
                alpha: Math.random()
            });
        }
    }

    const lerp = (start: number, end: number, amt: number) => (1 - amt) * start + amt * end;

    const render = () => {
      phaseRef.current += 0.01;
      const time = phaseRef.current;
      
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      // Position orb slightly higher (40% down) to allow chat text below without overlap
      const cy = height * 0.4; 
      
      ctx.clearRect(0, 0, width, height);

      // --- LAYER 1: AURORA (Ambient Background) ---
      // Smoothly interpolate the base hue for the background
      const targetBgBase = voiceType === 'helios' ? 210 : 260;
      currentBgHueRef.current = lerp(currentBgHueRef.current, targetBgBase, 0.02); // Slow transition (0.02)

      // Apply sine wave modulation on top of the smoothed base
      const hueBase = Math.sin(time * 0.1) * 20 + currentBgHueRef.current;
      
      // We always draw background, but modify alpha based on isAmbient
      const bgOpacity = isAmbient ? 1 : 0.4;
      
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, `hsla(${hueBase}, 60%, 8%, 1)`);
      gradient.addColorStop(1, `hsla(${hueBase + 40}, 50%, 5%, 1)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // --- LAYER 1.5: STARDUST ---
      ctx.fillStyle = 'white';
      starsRef.current.forEach(star => {
          star.y -= star.speed; // Move up
          if (star.y < 0) {
              star.y = height;
              star.x = Math.random() * width; // Respawn randomly x
          }
          
          const twinkle = Math.abs(Math.sin(time * 2 + star.x));
          ctx.globalAlpha = star.alpha * twinkle * (isAmbient ? 0.8 : 0.3);
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      if (isAmbient) {
          const drawBlob = (xOff: number, yOff: number, color: string, rScale: number) => {
              const x = cx + Math.sin(time * 0.2 + xOff) * (width * 0.3);
              const y = cy + Math.cos(time * 0.3 + yOff) * (height * 0.2);
              const grad = ctx.createRadialGradient(x, y, 0, x, y, width * rScale);
              grad.addColorStop(0, color);
              grad.addColorStop(1, 'rgba(0,0,0,0)');
              ctx.fillStyle = grad;
              ctx.fillRect(0, 0, width, height);
          };
          
          ctx.globalCompositeOperation = 'screen';
          drawBlob(0, 0, `hsla(${hueBase}, 70%, 20%, 0.15)`, 0.6);
          drawBlob(2, 4, `hsla(${hueBase + 50}, 70%, 25%, 0.15)`, 0.5);
          ctx.globalCompositeOperation = 'source-over';
      }

      // --- LAYER 2: THE CORE (Reacts to State) ---
      
      let targetRadius = 60;
      let targetHue = voiceType === 'helios' ? 200 : 270; // Blue vs Purple base
      let audioData = new Uint8Array(0);
      let analyser: AnalyserNode | null = null;

      // Determine Target State
      if (state === 'speaking') {
          analyser = audioEngine.getVoiceAnalyser();
          targetHue = voiceType === 'helios' ? 190 : 250; 
          targetRadius = 90;
      } else if (state === 'listening') {
          analyser = audioEngine.getMicAnalyser();
          targetHue = voiceType === 'helios' ? 280 : 320; // Purple vs Pink
          targetRadius = 80;
      } else if (state === 'thinking') {
          targetHue = 160; // Teal/Greenish
          targetRadius = 70;
      } else {
          // Idle
          targetHue = voiceType === 'helios' ? 210 : 260;
          targetRadius = 60 + Math.sin(time * 2) * 5; // Breathe
      }

      // Smoothly Interpolate Radius & Hue
      currentRadiusRef.current = lerp(currentRadiusRef.current, targetRadius, 0.05);
      currentHueRef.current = lerp(currentHueRef.current, targetHue, 0.05);

      // Get Audio Data if applicable
      let vol = 0;
      if (analyser) {
          const bufferLength = analyser.frequencyBinCount;
          audioData = new Uint8Array(bufferLength);
          analyser.getByteFrequencyData(audioData);
          
          // Calculate volume for size modulation
          let sum = 0;
          for(let i=0; i<bufferLength/2; i++) sum += audioData[i];
          vol = (sum / (bufferLength/2)) / 255; // 0.0 to 1.0
      }

      // --- DRAW THE ORB ---
      const r = currentRadiusRef.current + (vol * 50); // React to volume
      
      ctx.beginPath();
      
      // Generate Organic Shape
      const points = [];
      const segments = 100;
      
      for (let i = 0; i < segments; i++) {
          const angle = (Math.PI * 2 * i) / segments;
          
          let distortion = 0;
          
          if (state === 'thinking') {
              // Pulsating/Rotating spikes
              distortion = Math.sin((angle * 8) + (time * 5)) * 5;
          } else if ((state === 'speaking' || state === 'listening') && audioData.length > 0) {
              // Map frequency to angle
              const idx = Math.floor((i / segments) * (audioData.length / 3)); 
              const val = audioData[idx] || 0;
              distortion = (val / 255) * 30;
          }
          
          const finalR = r + distortion;
          points.push({
              x: cx + Math.cos(angle + time * 0.2) * finalR,
              y: cy + Math.sin(angle + time * 0.2) * finalR
          });
      }

      // Draw Curve
      if (points.length > 0) {
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 0; i < points.length; i++) {
              const p0 = points[i];
              const p1 = points[(i + 1) % points.length];
              const mx = (p0.x + p1.x) / 2;
              const my = (p0.y + p1.y) / 2;
              ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
          }
      }
      ctx.closePath();

      // Fill
      const orbGrad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.5);
      orbGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
      orbGrad.addColorStop(0.3, `hsla(${currentHueRef.current}, 80%, 70%, 0.6)`);
      orbGrad.addColorStop(1, `hsla(${currentHueRef.current}, 80%, 50%, 0)`);
      
      ctx.fillStyle = orbGrad;
      ctx.fill();

      // Core white glow
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fill();

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [state, isAmbient, voiceType]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial sizing
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed top-0 left-0 w-full h-full pointer-events-none z-0"
    />
  );
};

export default Visualizer;
