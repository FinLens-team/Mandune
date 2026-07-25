# About Feature

## Architecture

- `AboutView.tsx` owns the About page and the accessible easter-egg dialog boundary.
- `AboutEasterEggGame.tsx` owns the image-grid input surface and theme-driven feedback.
- `easter-egg-audio.ts` owns the credited Dagou Tap sample mapping, 128 BPM Web Audio scheduler, pitch shifting, and teardown. Closing the dialog must unmount the game and close its task-owned `AudioContext`.

## Gotchas & Decisions

- The current workspace theme selects the sound pack; the easter egg does not expose an independent theme selector.
- Audio starts only after direct user input. All timers, scheduled feedback, buffers, and the audio context are released on unmount.
- Dagou Tap attribution and redistribution boundaries are recorded in `NOTICE`, `ASSETS.md`, and `src/client/assets/audio/dagou-tap/README.md`; keep visible in-product attribution.
