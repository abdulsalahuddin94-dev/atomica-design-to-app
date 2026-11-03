#!/usr/bin/env node
// Writes a FigCli (Yolo) eval script that puts an image file as the fill of one frame or rectangle
// (Design_System_Intake_Skill/steps/images.md). The bytes go inside the script (figma.createImage), so no
// network access is needed inside Figma. Run the printed command; it changes only that node.
//   node tools/place_image.cjs <image.jpg|png> --file-key <key> --node "<node id or exact layer name>"
//        [--name "Hero Image"] [--credit "Photo by ... on Unsplash"] [--fit fill|fit|crop]
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const image = args[0];
const fileKey = opt('file-key');
const target = opt('node');
if (!image || !fs.existsSync(image) || !fileKey || !target) {
  console.log('Usage: node tools/place_image.cjs <image> --file-key <key> --node "<id or layer name>" [--name "Hero Image"] [--credit "..."] [--fit fill|fit|crop]');
  process.exit(1);
}
const bytes = fs.readFileSync(image);
if (bytes.length > 4 * 1024 * 1024) { console.log('Image is over 4 MB: export it smaller first (Figma limit and script size).'); process.exit(1); }
const scaleMode = { fill: 'FILL', fit: 'FIT', crop: 'CROP' }[opt('fit', 'fill')] || 'FILL';
const layerName = opt('name', null);
const credit = opt('credit', '');

const script = `// place_image.cjs: ${path.basename(image)} -> ${target}
if (figma.fileKey && figma.fileKey !== ${JSON.stringify(fileKey)}) return { error: 'Wrong file: ' + figma.root.name };
const target = ${JSON.stringify(target)};
let n = /^[0-9]+:[0-9]+$/.test(target) ? await figma.getNodeByIdAsync(target) : null;
if (!n) {
  const found = figma.currentPage.findAll(x => x.name === target);
  if (found.length !== 1) return { error: found.length + ' layers named "' + target + '" on page ' + figma.currentPage.name + '; pass the node id instead' };
  n = found[0];
}
if (!('fills' in n) || !['FRAME', 'RECTANGLE', 'ELLIPSE', 'POLYGON'].includes(n.type)) return { error: n.name + ' is a ' + n.type + '; image fills go on a frame or rectangle (an instance image slot: pass the layer inside it)' };
const img = figma.createImage(figma.base64Decode(${JSON.stringify(bytes.toString('base64'))}));
n.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: ${JSON.stringify(scaleMode)} }];
${layerName ? `n.name = ${JSON.stringify(layerName)};` : ''}
n.setPluginData('imageSource', ${JSON.stringify(JSON.stringify({ file: path.basename(image), credit }))});
const size = await img.getSizeAsync();
const check = { node: n.id, name: n.name, fill: n.fills[0].type, image: size.width + 'x' + size.height, frame: Math.round(n.width) + 'x' + Math.round(n.height) };
return typeof DS !== 'undefined' && DS.readBack ? { ...check, readBack: await DS.readBack([n]) } : check;
`;

const dir = '.claude/.state';
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `place_image_${Date.now()}.js`);
fs.writeFileSync(file, script);
console.log(`Script: ${file} (${Math.round(bytes.length / 1024)} KB image)`);
console.log(`Run (from the FigCli folder): FIGMA_FILE="<file name>" node src/index.js eval --file "${path.resolve(file)}"`);
