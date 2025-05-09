const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Create the icons directory if it doesn't exist
const iconsDir = path.join(__dirname, 'client', 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
  console.log('Created icons directory:', iconsDir);
}

// Define our conversions
const conversions = [
  {
    input: path.join(__dirname, 'client', 'public', 'notepad-icon.svg'),
    output: path.join(iconsDir, 'icon-512.png'),
    size: 512
  },
  {
    input: path.join(__dirname, 'client', 'public', 'notepad-icon.svg'),
    output: path.join(iconsDir, 'icon-192.png'),
    size: 192
  },
  {
    input: path.join(__dirname, 'client', 'public', 'favicon.svg'),
    output: path.join(__dirname, 'client', 'public', 'favicon.ico'),
    size: 32
  }
];

// Function to convert SVG to PNG/ICO using ImageMagick
function convertFile(input, output, size) {
  const cmd = `convert -background none -size ${size}x${size} ${input} ${output}`;
  console.log(`Running: ${cmd}`);
  
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command: ${error.message}`);
        reject(error);
        return;
      }
      if (stderr) {
        console.error(`Command stderr: ${stderr}`);
      }
      console.log(`Converted ${input} to ${output} at size ${size}x${size}`);
      resolve();
    });
  });
}

// Run the conversions
async function runConversions() {
  for (const conv of conversions) {
    try {
      await convertFile(conv.input, conv.output, conv.size);
    } catch (error) {
      console.error(`Failed to convert ${conv.input} to ${conv.output}: ${error}`);
    }
  }
  console.log('All conversions completed');
}

// Execute
runConversions().catch(error => {
  console.error('Conversion process failed:', error);
  process.exit(1);
}); 