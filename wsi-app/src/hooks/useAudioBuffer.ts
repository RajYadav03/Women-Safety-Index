/**
 * useAudioBuffer — Rolling Ring Buffer for Audio Evidence
 *
 * Records audio in 5-second chunks, keeping only the 2 most recent.
 * Total evidence window: 10 seconds.
 *
 * On SOS trigger:
 *   1. Stops the rotation
 *   2. "Locks" the cached files (moves to permanent storage)
 *   3. Returns the locked file URIs for dispatch
 *
 * Privacy: Audio is continuously overwritten — only 10s exists at any time.
 * On SOS, those 10s are preserved as evidence.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

const CHUNK_DURATION_MS = 5000; // 5 seconds per chunk
const MAX_CHUNKS = 2;           // Keep 2 chunks = 10 seconds total

interface AudioChunk {
  uri: string;
  timestamp: string;
  index: number;
}

interface UseAudioBufferReturn {
  isRecording: boolean;
  chunks: AudioChunk[];
  lockedFiles: string[];
  startBuffer: () => Promise<void>;
  stopBuffer: () => Promise<void>;
  lockAndPreserve: () => Promise<string[]>;
}

export default function useAudioBuffer(): UseAudioBufferReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [chunks, setChunks] = useState<AudioChunk[]>([]);
  const [lockedFiles, setLockedFiles] = useState<string[]>([]);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const chunkIndexRef = useRef(0);
  const chunksRef = useRef<AudioChunk[]>([]);
  const rotationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveRef = useRef(false);

  // ── Record a single 5-second chunk ──
  const recordChunk = useCallback(async (): Promise<AudioChunk | null> => {
    if (Platform.OS === 'web') return null;

    try {
      // Create recording with low-quality preset (small file size)
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.LOW_QUALITY
      );
      recordingRef.current = recording;

      // Wait for chunk duration
      await new Promise(resolve => setTimeout(resolve, CHUNK_DURATION_MS));

      // Stop recording
      await recording.stopAndUnloadAsync();
      recordingRef.current = null;

      const uri = recording.getURI();
      if (!uri) return null;

      const chunk: AudioChunk = {
        uri,
        timestamp: new Date().toISOString(),
        index: chunkIndexRef.current++,
      };

      return chunk;
    } catch (err) {
      console.log('[AudioBuffer] Chunk recording error:', err);
      return null;
    }
  }, []);

  // ── FIFO rotation — keeps only MAX_CHUNKS ──
  const addChunk = useCallback((newChunk: AudioChunk) => {
    chunksRef.current = [...chunksRef.current, newChunk];

    // Remove oldest if over limit
    while (chunksRef.current.length > MAX_CHUNKS) {
      const old = chunksRef.current.shift();
      if (old) {
        // Delete old file to free space
        FileSystem.deleteAsync(old.uri, { idempotent: true }).catch(() => {});
      }
    }

    setChunks([...chunksRef.current]);
  }, []);

  // ── Rotation loop ──
  const runRotation = useCallback(async () => {
    if (!isActiveRef.current) return;

    const chunk = await recordChunk();
    if (chunk) {
      addChunk(chunk);
    }

    // Schedule next chunk
    if (isActiveRef.current) {
      rotationTimer.current = setTimeout(runRotation, 100); // Small gap between chunks
    }
  }, [recordChunk, addChunk]);

  // ── Start the buffer ──
  const startBuffer = useCallback(async () => {
    if (Platform.OS === 'web') {
      console.log('[AudioBuffer] Not available on web');
      return;
    }
    if (isActiveRef.current) return;

    try {
      // Request microphone permission
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        console.log('[AudioBuffer] Microphone permission denied');
        return;
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      isActiveRef.current = true;
      setIsRecording(true);
      console.log('[AudioBuffer] Started rolling buffer');

      // Start rotation
      runRotation();
    } catch (err) {
      console.log('[AudioBuffer] Start error:', err);
    }
  }, [runRotation]);

  // ── Stop the buffer ──
  const stopBuffer = useCallback(async () => {
    isActiveRef.current = false;
    setIsRecording(false);

    if (rotationTimer.current) {
      clearTimeout(rotationTimer.current);
      rotationTimer.current = null;
    }

    // Stop any in-progress recording
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {}
      recordingRef.current = null;
    }

    console.log('[AudioBuffer] Stopped');
  }, []);

  // ── Lock & Preserve — called on SOS trigger ──
  const lockAndPreserve = useCallback(async (): Promise<string[]> => {
    // 1. Stop the rotation immediately
    await stopBuffer();

    // 2. Move cached files to permanent storage
    const preserved: string[] = [];
    const evidenceDir = `${FileSystem.Paths.cache.uri}sos_evidence/`;

    try {
      await FileSystem.makeDirectoryAsync(evidenceDir, { intermediates: true });
    } catch {}

    for (const chunk of chunksRef.current) {
      try {
        const destName = `evidence_${Date.now()}_${chunk.index}.m4a`;
        const destUri = `${evidenceDir}${destName}`;
        await FileSystem.moveAsync({ from: chunk.uri, to: destUri });
        preserved.push(destUri);
        console.log(`[AudioBuffer] Preserved: ${destName}`);
      } catch (err) {
        console.log('[AudioBuffer] Preserve error:', err);
      }
    }

    // Clear the chunk list
    chunksRef.current = [];
    setChunks([]);
    setLockedFiles(preserved);

    console.log(`[AudioBuffer] Locked ${preserved.length} evidence files`);
    return preserved;
  }, [stopBuffer]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (rotationTimer.current) clearTimeout(rotationTimer.current);
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  return {
    isRecording,
    chunks,
    lockedFiles,
    startBuffer,
    stopBuffer,
    lockAndPreserve,
  };
}
