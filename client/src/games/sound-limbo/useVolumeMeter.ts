import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseVolumeMeterReturn {
  volume: number;
  isListening: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

export function useVolumeMeter(): UseVolumeMeterReturn {
  const [volume, setVolume] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const smoothedRef = useRef(0);
  const lastUpdateRef = useRef(0);

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    smoothedRef.current = 0;
    setVolume(0);
    setIsListening(false);
  }, []);

  const start = useCallback(async () => {
    stop();
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext();
      await ctx.resume(); // Safari fix
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.fftSize);

      const tick = (timestamp: number) => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const sample = (dataArray[i] - 128) / 128;
          sum += sample * sample;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const raw = Math.min(100, rms * 300);

        smoothedRef.current = smoothedRef.current * 0.7 + raw * 0.3;

        // Throttle React state updates to ~20fps
        if (timestamp - lastUpdateRef.current > 50) {
          setVolume(Math.round(smoothedRef.current));
          lastUpdateRef.current = timestamp;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
      setIsListening(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Microphone permission denied. Please allow mic access.');
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setError('No microphone found. Please connect a microphone.');
      } else {
        setError('Could not access microphone.');
      }
    }
  }, [stop]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { volume, isListening, error, start, stop };
}
