/**
 * Strips EXIF and other metadata from all images in the artworks folder.
 * Run with: npm run strip-metadata
 * Run this after adding new photos to remove location, camera info, etc.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ARTWORKS_DIR = path.join(__dirname, 'artworks');
const PHOTOGRAPHY_DIR = path.join(__dirname, 'photography');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

async function stripDir(dir, label) {
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir);
  let processed = 0;
  let errors = 0;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;

    const filePath = path.join(dir, file);
    const tempPath = path.join(dir, `_temp_${file}`);

    try {
      await sharp(filePath)
        .rotate()
        .toFile(tempPath);
      fs.unlinkSync(filePath);
      fs.renameSync(tempPath, filePath);
      console.log(`  ✓ ${label}/${file}`);
      processed++;
    } catch (err) {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      console.error(`  ✗ ${label}/${file}: ${err.message}`);
      errors++;
    }
  }
  return { processed, errors };
}

async function stripMetadata() {
  console.log('Stripping metadata from artworks...');
  const art = await stripDir(ARTWORKS_DIR, 'artworks');
  console.log('\nStripping metadata from photography...');
  const photo = await stripDir(PHOTOGRAPHY_DIR, 'photography');
  const total = art.processed + art.errors + photo.processed + photo.errors;
  console.log(`\nDone. Processed ${art.processed + photo.processed} images total.`);
}

stripMetadata().catch(err => {
  console.error(err);
  process.exit(1);
});
