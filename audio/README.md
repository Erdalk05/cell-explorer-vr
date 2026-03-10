# Audio Narration Files

Place MP3 narration clips here. Each file is loaded by the `organelle-info` component
in `proximity.js` when a user approaches the corresponding organelle.

Missing files are silently ignored — the info panel will still appear; only the 🔊
speaker icon and spatial sound will be absent.

## Expected narration files

| File | Organelle | Trigger distance |
|------|-----------|-----------------|
| `nucleus.mp3` | Nucleus | 5 m |
| `mitochondria.mp3` | Mitochondria | 4 m |
| `endoplasmic-reticulum.mp3` | Endoplasmic Reticulum | 4.5 m |
| `ribosomes.mp3` | Ribosomes | 5 m |
| `golgi-apparatus.mp3` | Golgi Apparatus | 4 m |

## Recommended format

- Codec : MP3, 128 kbps
- Duration : 10–25 seconds
- Sample rate : 44.1 kHz, mono or stereo

## Quick generation (ElevenLabs / TTS)

Feed each organelle's `body` text from `index.html` into any TTS service and export
as MP3, naming the file exactly as listed above.
