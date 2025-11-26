
import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../services/audioEngine';

export type VisualizerState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface VisualizerProps {
  state: VisualizerState;
  isAmbient: boolean;
  voiceType: 'helios' | 'elara' | 'duo' | 'nsd';
}

const Visualizer: React.FC<VisualizerProps> = ({ state, isAmbient, voiceType }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Use Refs to store current interpolation values to persist between renders
  const currentRadiusRef = useRef(60);
  const currentHueRef = useRef(200);
  
  // Track background hue separately for smooth transitions between personas
  // Helios: 210, Elara: 260, Duo: 235 (Mix), NSD: 45 (Gold)
  const targetBgHue = voiceType === 'helios' ? 210 : voiceType === 'elara' ? 260 : voiceType === 'nsd' ? 45 : 235;
  const currentBgHueRef = useRef(targetBgHue);
  const phaseRef = useRef(0);
  
  // Shooting Stars State
  const starsRef = useRef<{x: number, y: number, size: number, speed: number, alpha: number}[]>([]);
  const shootingStarsRef = useRef<{x: number, y: number, length: number, speed: number, angle: number, life: number}[]>([]);
  const lastShootingStarTime = useRef(0);

  useEffect(() => {
    let animationFrameId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // CRITICAL FIX: Set dimensions BEFORE generating stars
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Initialize background stars if empty
    if (starsRef.current.length === 0) {
        for(let i=0; i<100; i++) { 
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
      phaseRef.current += 0.005; // Slower time constant for deep space feel
      const time = phaseRef.current;
      
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height * 0.4; 
      
      ctx.clearRect(0, 0, width, height);

      // Smoothly interpolate Background Hue
      currentBgHueRef.current = lerp(currentBgHueRef.current, targetBgHue, 0.01);
      const bgHue = currentBgHueRef.current;

      // --- LAYER 1: NEBULA (Atmospheric Background) ---
      
      // Base dark fill
      ctx.fillStyle = '#020205';
      ctx.fillRect(0,0, width, height);

      const drawNebulaCloud = (xOffset: number, yOffset: number, hueOffset: number, scale: number) => {
        const x = cx + Math.sin(time * 0.5 + xOffset) * (width * 0.4);
        const y = cy + Math.cos(time * 0.3 + yOffset) * (height * 0.3);
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, width * scale);
        
        gradient.addColorStop(0, `hsla(${bgHue + hueOffset}, 60%, 15%, 0.4)`);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, width * scale, 0, Math.PI * 2);
        ctx.fill();
      };

      // Cloud 1 (Main Theme)
      drawNebulaCloud(0, 0, 10, 0.8);
      // Cloud 2 (Complementary)
      drawNebulaCloud(2, 2, 40, 0.9);
      // Cloud 3 (Accent)
      drawNebulaCloud(4, 5, -30, 0.6);


      // --- LAYER 1.5: STARDUST ---
      ctx.fillStyle = 'white';
      starsRef.current.forEach(star => {
          star.y -= star.speed; // Move up
          if (star.y < 0) {
              star.y = height;
              star.x = Math.random() * width; // Respawn randomly x
          }
          
          const twinkle = Math.abs(Math.sin(time * 3 + star.x));
          ctx.globalAlpha = star.alpha * twinkle * (isAmbient ? 0.9 : 0.5);
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
          ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // --- LAYER 1.7: SHOOTING STARS ---
      // Randomly spawn shooting star
      if (Date.now() - lastShootingStarTime.current > 4000 && Math.random() > 0.98) {
         lastShootingStarTime.current = Date.now();
         shootingStarsRef.current.push({
             x: Math.random() * width,
             y: Math.random() * (height * 0.5),
             length: 100 + Math.random() * 200,
             speed: 15 + Math.random() * 10,
             angle: Math.PI / 4 + (Math.random() * 0.2 - 0.1), // Down-right
             life: 1.0
         });
      }

      // Render Shooting Stars
      for (let i = shootingStarsRef.current.length - 1; i >= 0; i--) {
          const s = shootingStarsRef.current[i];
          s.x += Math.cos(s.angle) * s.speed;
          s.y += Math.sin(s.angle) * s.speed;
          s.life -= 0.02;

          if (s.life <= 0) {
              shootingStarsRef.current.splice(i, 1);
              continue;
          }

          const grad = ctx.createLinearGradient(s.x, s.y, s.x - Math.cos(s.angle) * s.length, s.y - Math.sin(s.angle) * s.length);
          grad.addColorStop(0, 'rgba(255,255,255,1)');
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.globalAlpha = s.life;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x - Math.cos(s.angle) * s.length, s.y - Math.sin(s.angle) * s.length);
          ctx.stroke();
          ctx.globalAlpha = 1.0;
      }

      // --- LAYER 2: THE CORE (Reacts to State) ---
      
      let targetRadius = 60;
      let targetHue = voiceType === 'helios' ? 200 : voiceType === 'elara' ? 270 : voiceType === 'nsd' ? 45 : 235;
      let audioData = new Uint8Array(0);
      let analyser: AnalyserNode | null = null;

      // Determine Target State
      if (state === 'speaking') {
          analyser = audioEngine.getVoiceAnalyser();
          // Helios: 190, Elara: 290, NSD: 50 (Gold Bright), Duo: 220
          targetHue = voiceType === 'helios' ? 190 : voiceType === 'elara' ? 290 : voiceType === 'nsd' ? 50 : 220; 
          targetRadius = 90;
      } else if (state === 'listening') {
          analyser = audioEngine.getMicAnalyser();
          targetHue = voiceType === 'helios' ? 280 : voiceType === 'elara' ? 320 : voiceType === 'nsd' ? 30 : 300;
          targetRadius = 80;
      } else if (state === 'thinking') {
          targetHue = 160; // Teal/Greenish
          targetRadius = 70;
      } else {
          // Idle
          targetHue = voiceType === 'helios' ? 210 : voiceType === 'elara' ? 260 : voiceType === 'nsd' ? 45 : 235;
          targetRadius = 60 + Math.sin(time * 2) * 5; // Breathe
      }

      // Smoothly Interpolate Radius & Hue
      currentRadiusRef.current = lerp(currentRadiusRef.current, targetRadius, 0.025);
      currentHueRef.current = lerp(currentHueRef.current, targetHue, 0.025);

      // Get Audio Data if applicable
      let vol = 0;
      if (analyser) {
          const bufferLength = analyser.frequencyBinCount;
          audioData = new Uint8Array(bufferLength);
          analyser.getByteFrequencyData(audioData);
          
          let sum = 0;
          for(let i=0; i<bufferLength/2; i++) sum += audioData[i];
          vol = (sum / (bufferLength/2)) / 255; // 0.0 to 1.0
      }

      // --- LAYER 2.5: REACTIVE BLOOM (Glow behind orb) ---
      const bloomRadius = currentRadiusRef.current * 2.5 + (vol * 100);
      const bloomGrad = ctx.createRadialGradient(cx, cy, currentRadiusRef.current * 0.5, cx, cy, bloomRadius);
      bloomGrad.addColorStop(0, `hsla(${currentHueRef.current}, 80%, 60%, 0.3)`);
      bloomGrad.addColorStop(1, `hsla(${currentHueRef.current}, 80%, 40%, 0)`);
      
      ctx.fillStyle = bloomGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, bloomRadius, 0, Math.PI * 2);
      ctx.fill();

      // --- DRAW THE ORB ---
      const growth = Math.min(vol * 50, 30);
      const r = currentRadiusRef.current + growth; 
      
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
