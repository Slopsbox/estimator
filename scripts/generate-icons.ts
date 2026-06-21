import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SVG = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="96" fill="#0B1D3A"/>
  <g transform="translate(128, 80) scale(5.33)">
    <!-- Cards fanned out -->
    <g transform="rotate(-18, 24, 52)">
      <rect x="18" y="7" width="12" height="19" rx="2.2" fill="rgba(255,255,255,0.18)"/>
    </g>
    <g transform="rotate(18, 24, 52)">
      <rect x="18" y="7" width="12" height="19" rx="2.2" fill="rgba(255,255,255,0.18)"/>
    </g>
    <g transform="rotate(-9, 24, 52)">
      <rect x="18" y="7" width="12" height="19" rx="2.2" fill="rgba(255,255,255,0.50)"/>
    </g>
    <g transform="rotate(9, 24, 52)">
      <rect x="18" y="7" width="12" height="19" rx="2.2" fill="rgba(255,255,255,0.50)"/>
    </g>
    <!-- Center card -->
    <rect x="18" y="7" width="12" height="19" rx="2.2" fill="white"/>
    <!-- Card face details -->
    <rect x="20.5" y="10" width="7" height="1.3" rx="0.65" fill="rgba(9,25,93,0.25)"/>
    <circle cx="24" cy="16.5" r="2.2" fill="rgba(9,25,93,0.22)"/>
    <rect x="20.5" y="22.5" width="7" height="1.3" rx="0.65" fill="rgba(9,25,93,0.25)"/>
    <!-- Palm arc -->
    <path d="M6 44 C6 35, 13 25, 24 25 C35 25, 42 35, 42 44" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.36)" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M6 44 C4 40.5, 4 36, 8 32" stroke="rgba(255,255,255,0.28)" stroke-width="2" stroke-linecap="round" fill="none"/>
    <path d="M42 44 C44 40.5, 44 36, 40 32" stroke="rgba(255,255,255,0.28)" stroke-width="2" stroke-linecap="round" fill="none"/>
  </g>
</svg>`;

const sizes = [192, 512] as const;
const outDir = resolve(__dirname, '../public/icons');

mkdirSync(outDir, { recursive: true });

async function generate(): Promise<void> {
  for (const size of sizes) {
    const png = await sharp(Buffer.from(SVG))
      .resize(size, size)
      .png()
      .toBuffer();
    writeFileSync(resolve(outDir, `icon-${size}x${size}.png`), png);
    console.log(`Generated icon-${size}x${size}.png`);
  }

  // Apple touch icon (180x180)
  const apple = await sharp(Buffer.from(SVG))
    .resize(180, 180)
    .png()
    .toBuffer();
  writeFileSync(resolve(outDir, 'apple-touch-icon.png'), apple);
  console.log('Generated apple-touch-icon.png');
}

generate().catch((err: unknown) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
