/**
 * Generate PNG icons from SVG for PWA manifest
 * Requires: npm install --save-dev sharp
 */

const fs = require('fs');
const path = require('path');

// Icon sizes from manifest.json
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const svgPath = path.join(__dirname, '../public/icons/icon.svg');
const outputDir = path.join(__dirname, '../public/icons');

async function generateIcons() {
  try {
    // Check if sharp is available
    let sharp;
    try {
      sharp = require('sharp');
    } catch (e) {
      console.error('❌ Error: sharp is not installed.');
      console.error('   Please run: npm install --save-dev sharp');
      process.exit(1);
    }

    // Read SVG
    if (!fs.existsSync(svgPath)) {
      console.error(`❌ SVG not found: ${svgPath}`);
      process.exit(1);
    }

    const svgBuffer = fs.readFileSync(svgPath);
    console.log(`✓ Read SVG from ${svgPath}`);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Generate each size
    console.log(`\nGenerating ${sizes.length} icon sizes...`);
    for (const size of sizes) {
      const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);
      
      await sharp(svgBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      
      console.log(`  ✓ Generated ${size}x${size} → ${path.basename(outputPath)}`);
    }

    console.log(`\n✅ Successfully generated all icons in ${outputDir}`);
  } catch (error) {
    console.error('❌ Error generating icons:', error.message);
    process.exit(1);
  }
}

generateIcons();
