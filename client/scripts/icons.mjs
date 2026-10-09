// Generates the app icons from one SVG. Run with: node client/scripts/icons.mjs
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');
await mkdir(out, { recursive: true });

const HEART = 'M50 82C26 66 14 52 14 37.5 14 26.7 22.4 18 33 18c6.6 0 12.6 3.3 17 9 4.4-5.7 10.4-9 17-9 10.6 0 19 8.7 19 19.5C86 52 74 66 50 82z';

/** `inset` shrinks the heart so maskable icons keep it inside the safe zone. */
const icon = ({ radius = 22, inset = 0.56, glyph = HEART } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d6456b"/><stop offset="1" stop-color="#f08a6e"/></linearGradient>
    <radialGradient id="s" cx="0.25" cy="0.15" r="0.9"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="100" height="100" rx="${radius}" fill="url(#g)"/>
  <rect width="100" height="100" rx="${radius}" fill="url(#s)"/>
  <g transform="translate(50 51) scale(${inset}) translate(-50 -50)"><path d="${glyph}" fill="#fff"/></g>
</svg>`;

const png = (svg, size, file) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toFile(path.join(out, file));

const CHAT = 'M20 26c0-5 4-9 9-9h42c5 0 9 4 9 9v30c0 5-4 9-9 9H46L30 80V65h-1c-5 0-9-4-9-9z';
const BELL = 'M50 14c-13 0-23 10-23 23v16l-8 12v5h62v-5l-8-12V37c0-13-10-23-23-23zm-9 62a9 9 0 0 0 18 0z';
const PHOTO = 'M18 28c0-4 3-7 7-7h50c4 0 7 3 7 7v44c0 4-3 7-7 7H25c-4 0-7-3-7-7zm8 40h48L58 46 46 61l-8-9zM36 42a6 6 0 1 0 0-12 6 6 0 0 0 0 12z';

await writeFile(path.join(out, 'favicon.svg'), icon().trim());
await png(icon(), 192, 'icon-192.png');
await png(icon(), 512, 'icon-512.png');
await png(icon({ radius: 0 }), 180, 'apple-touch-icon.png');
await png(icon({ radius: 0, inset: 0.42 }), 512, 'maskable-512.png');
await png(icon({ radius: 50 }), 96, 'shortcut-love.png');
await png(icon({ radius: 50, glyph: BELL, inset: 0.5 }), 96, 'shortcut-nudge.png');
await png(icon({ radius: 50, glyph: CHAT, inset: 0.52 }), 96, 'shortcut-chat.png');
await png(icon({ radius: 50, glyph: PHOTO, inset: 0.52 }), 96, 'shortcut-memory.png');

// Monochrome badge shown in the Android status bar
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${HEART}" fill="#fff"/></svg>`;
await png(badge, 96, 'badge-96.png');

// Preview images for the Windows widget picker
const widget = (value, caption) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="#fbf6f2"/>
  <text x="300" y="150" font-family="Georgia, serif" font-size="54" text-anchor="middle" fill="#d6456b">♥</text>
  <text x="300" y="250" font-family="Georgia, serif" font-size="96" text-anchor="middle" fill="#2a1f24">${value}</text>
  <text x="300" y="305" font-family="Helvetica, Arial, sans-serif" font-size="30" text-anchor="middle" fill="#7d6c73">${caption}</text>
</svg>`;
await sharp(Buffer.from(widget('1,247', 'days together'))).png().toFile(path.join(out, 'widget-counter.png'));
await sharp(Buffer.from(widget('24', 'days to our anniversary'))).png().toFile(path.join(out, 'widget-next.png'));

console.log('Icons written to', out);
