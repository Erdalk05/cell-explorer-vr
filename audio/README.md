# Audio

Place .mp3 / .ogg audio files here.

Suggested files:
- ambient.mp3         — low-frequency cellular heartbeat loop
- enter.mp3           — sound when entering an organelle
- info.mp3            — UI info-panel open chime

Load them in index.html inside <a-assets>:
  <audio id="ambient" src="audio/ambient.mp3" preload="auto"></audio>

Then play with:
  <a-sound src="#ambient" autoplay="true" loop="true" positional="false"></a-sound>
