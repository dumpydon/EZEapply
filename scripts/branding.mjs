import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

export const ICON_SIZES = [16, 32, 48, 96, 128];

/** Render the EZEapply mark at the sizes Chrome uses. */
export async function generateBranding(outputDirectory) {
  const svg = await readFile(new URL('../src/assets/local-icon.svg', import.meta.url));
  const directory = join(outputDirectory, 'custom', 'icon');
  await mkdir(directory, { recursive: true });
  await Promise.all(
    ICON_SIZES.map((size) =>
      sharp(svg, { density: 192 })
        .resize(size, size)
        .png()
        .toFile(join(directory, `${size}.png`)),
    ),
  );
  return Object.fromEntries(ICON_SIZES.map((size) => [String(size), `custom/icon/${size}.png`]));
}
