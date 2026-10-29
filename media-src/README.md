# Installation film

An original illustrated macOS / Chrome walkthrough inspired by Cue's clear,
chaptered first-launch presentation. No Cue artwork or code is reused. No real
desktop recording, personal data, account, application or API key appears.

- Master: **1920 × 1440**, 30 frames/second, 15 seconds, H.264 CRF 16.
- README preview: **960 × 720** GIF, 12 frames/second, optimized palette.
- Six chapters: GitHub ZIP → Downloads and unzip → Developer mode → Load unpacked
  → select the extracted folder → open EZEapply.
- Captions and a PNG poster accompany the film.

With Node dependencies installed and `ffmpeg` on PATH:

```sh
node media-src/install-film.mjs --stills
node media-src/install-film.mjs
```

The six review frames and render scratch files stay in ignored `.local/`.
Published assets are in `docs/media/`. Edit `frameSVG` and the scene functions,
then render again. Do not put credentials, browser exports or actual applicant
information into the scenes.
