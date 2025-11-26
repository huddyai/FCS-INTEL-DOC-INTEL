
/**
 * Decodes a Base64 string into a Uint8Array.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Plays raw PCM audio data received from Gemini API.
 * 
 * @param audioContext - The Web Audio API Context
 * @param base64PCM - The raw PCM data in base64 format (24kHz, Mono, 16-bit usually)
 * @param sampleRate - Sample rate of the audio (default 24000 for Gemini TTS)
 */
export const playPCMData = async (
  audioContext: AudioContext,
  base64PCM: string,
  sampleRate: number = 24000
): Promise<void> => {
  const pcmData = base64ToUint8Array(base64PCM);
  
  // Convert 16-bit PCM to Float32
  const float32Data = new Float32Array(pcmData.length / 2);
  const dataView = new DataView(pcmData.buffer);
  
  for (let i = 0; i < float32Data.length; i++) {
    // Little Endian
    const int16 = dataView.getInt16(i * 2, true); 
    // Normalize to [-1, 1]
    float32Data[i] = int16 < 0 ? int16 / 32768 : int16 / 32767;
  }

  // Create Audio Buffer
  const buffer = audioContext.createBuffer(1, float32Data.length, sampleRate);
  buffer.getChannelData(0).set(float32Data);

  // Create Source
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start();

  return new Promise((resolve) => {
    source.onended = () => resolve();
  });
};
