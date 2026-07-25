import musicUrl from "../assets/audio/waiting-mascot-music.m4a";

let audioContext: AudioContext | null = null;
let musicBuffer: AudioBuffer | null = null;
let musicBufferPromise: Promise<AudioBuffer> | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioContext) return audioContext;

  const AudioContextConstructor = window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext = new AudioContextConstructor();
  return audioContext;
}

function loadMusic(context: AudioContext): Promise<AudioBuffer> {
  if (musicBuffer) return Promise.resolve(musicBuffer);
  if (musicBufferPromise) return musicBufferPromise;

  musicBufferPromise = fetch(musicUrl)
    .then((response) => {
      if (!response.ok) throw new Error("waiting_mascot_music_load_failed");
      return response.arrayBuffer();
    })
    .then((bytes) => context.decodeAudioData(bytes))
    .then((buffer) => {
      musicBuffer = buffer;
      return buffer;
    })
    .catch((error: unknown) => {
      musicBufferPromise = null;
      throw error;
    });
  return musicBufferPromise;
}

/** Unlock audio during a user gesture so the waiting-page entry can play later. */
export function prepareWaitingMascotMusic(): void {
  const context = getAudioContext();
  if (!context) return;
  void context.resume().then(() => loadMusic(context)).catch(() => undefined);
}

/** Every call creates a separate source, so repeated mascot clicks can overlap. */
export async function playWaitingMascotMusic(): Promise<void> {
  const context = getAudioContext();
  if (!context) return;

  try {
    await context.resume();
    const buffer = await loadMusic(context);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.addEventListener("ended", () => source.disconnect(), { once: true });
    source.start();
  } catch {
    // Audio is optional; browser policy or decoding failures must not block analysis.
  }
}
