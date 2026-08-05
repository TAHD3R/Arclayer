export type NotificationSoundTone = "chime" | "pulse" | "pop";

type ToneNote = {
  frequency: number;
  startsAt: number;
  duration: number;
  oscillator: OscillatorType;
  gain: number;
};

const TONE_NOTES: Record<NotificationSoundTone, readonly ToneNote[]> = {
  chime: [
    { frequency: 659.25, startsAt: 0, duration: 0.16, oscillator: "sine", gain: 0.12 },
    { frequency: 880, startsAt: 0.11, duration: 0.24, oscillator: "sine", gain: 0.1 },
  ],
  pulse: [
    { frequency: 440, startsAt: 0, duration: 0.11, oscillator: "triangle", gain: 0.1 },
    { frequency: 554.37, startsAt: 0.14, duration: 0.11, oscillator: "triangle", gain: 0.1 },
  ],
  pop: [{ frequency: 784, startsAt: 0, duration: 0.13, oscillator: "sine", gain: 0.11 }],
};

function scheduleNote(context: AudioContext, note: ToneNote): Promise<void> {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const startsAt = context.currentTime + note.startsAt;
  const endsAt = startsAt + note.duration;

  oscillator.type = note.oscillator;
  oscillator.frequency.setValueAtTime(note.frequency, startsAt);
  if (note.oscillator === "sine" && note.duration < 0.15) {
    oscillator.frequency.exponentialRampToValueAtTime(note.frequency * 1.18, endsAt);
  }
  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(note.gain, startsAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);
  oscillator.connect(gain);
  gain.connect(context.destination);

  return new Promise((resolve) => {
    oscillator.addEventListener("ended", () => resolve(), { once: true });
    oscillator.start(startsAt);
    oscillator.stop(endsAt);
  });
}

export async function playNotificationSound(tone: NotificationSoundTone): Promise<void> {
  if (typeof window === "undefined" || !window.AudioContext) {
    throw new Error("This browser does not support notification sound playback.");
  }

  const context = new window.AudioContext();
  try {
    if (context.state === "suspended") {
      await context.resume();
    }
    await Promise.all(TONE_NOTES[tone].map((note) => scheduleNote(context, note)));
  } finally {
    await context.close();
  }
}
