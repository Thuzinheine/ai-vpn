import fs from 'fs';
import axios from 'axios';

const SOURCES = [
  'https://raw.githubusercontent.com/Epodonios/v2ray-configs/main/All_Configs_Sub.txt',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt',
  'https://raw.githubusercontent.com/peass/v2ray-node/main/vless'
];

function extractVless(rawText) {
  let list = [];
  if (!rawText || typeof rawText !== 'string') return list;

  const directMatches = rawText.match(/vless:\/\/[^\s<"'\n\r]+/g);
  if (directMatches) list.push(...directMatches);

  try {
    const cleanStr = rawText.trim().replace(/\s+/g, '');
    const decoded = Buffer.from(cleanStr, 'base64').toString('utf-8');
    const decodedMatches = decoded.match(/vless:\/\/[^\s<"'\n\r]+/g);
    if (decodedMatches) list.push(...decodedMatches);
  } catch (e) {}

  return list;
}

async function main() {
  let existingNodes = [];
  if (fs.existsSync('sub.txt')) {
    try {
      const oldRaw = fs.readFileSync('sub.txt', 'utf-8');
      const oldDecoded = Buffer.from(oldRaw, 'base64').toString('utf-8');
      existingNodes = extractVless(oldDecoded);
    } catch (e) {}
  }

  let newCollected = [];
  for (const url of SOURCES) {
    try {
      const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'v2rayNG/1.8.12' } });
      const found = extractVless(res.data);
      if (found.length > 0) newCollected.push(...found);
    } catch (e) {}
  }

  const combined = [...new Set([...existingNodes, ...newCollected])];
  const targetCount = Math.min(combined.length, 60);
  const finalNodes = [];

  for (let i = 0; i < targetCount; i++) {
    const baseUri = combined[i].split('#')[0];
    const country = (i % 2 === 0) ? 'SG' : 'JP';
    finalNodes.push(`${baseUri}#${country}-AI-VLESS-${String(i + 1).padStart(2, '0')}`);
  }

  const base64Data = Buffer.from(finalNodes.join('\n')).toString('base64');
  fs.writeFileSync('sub.txt', base64Data, 'utf-8');
  console.log(`Merged & Exported ${finalNodes.length} nodes.`);
}

main();
