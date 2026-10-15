# Forehead Games

Static site (no build step): Tic Tac Toe (unbeatable AI), Carrom and Ludo on a photo.

## Deploy on Netlify
1. Go to app.netlify.com > Add new site > Deploy manually, and drag this whole folder in.
   (Or push it to GitHub and import it: build command empty, publish directory `.`)
2. Open the site URL on your phone and laptop.

## Files
- index.html, style.css, app.js: the app
- assets/ttt.jpg (Tic Tac Toe photo), assets/board.jpg (Carrom and Ludo photo): swap these to change the photo
- netlify.toml: publish settings and caching

## Online play
Uses PeerJS (free public broker + WebRTC), loaded from a CDN, so no server of your own is needed.
Create a room, share the QR or code; the friend scans or types it. HTTPS (Netlify gives this) is required.
Some strict office/school networks block peer-to-peer connections.

## Controls
- Phone: tap and drag. Laptop: mouse, plus Left/Right arrow keys to move the carrom striker.
- Red X (top right) leaves the game and returns to the menu.
