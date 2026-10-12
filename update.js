import fs from 'fs';
import axios from 'axios';

const SOURCES = [
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub2.txt',
  'https://raw.githubusercontent.com/peass/v2ray-node/main/vless',
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/normal/vless'
];

function extractVless(content) {
  let list = [];
  if (!content || typeof content !== 'string') return list;

  // Direct VLESS regex
  const direct = content.match(/vless:\/\/[^\s<"'\n\r]+/g);
  if (direct) list.push(...direct);

  // Base64 decode
  try {
    const clean = content.trim().replace(/\s+/g, '');
    const decoded = Buffer.from(clean, 'base64').toString('utf-8');
    const matched = decoded.match(/vless:\/\/[^\s<"'\n\r]+/g);
    if (matched) list.push(...matched);
  } catch (e) {}

  return list;
}

async function main() {
  console.log("Scraping live VLESS nodes...");
  let collected = [];

  for (const url of SOURCES) {
    try {
      const res = await axios.get(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'v2rayNG/1.8.12' }
      });
      const keys = extractVless(res.data);
      if (keys.length > 0) {
        collected.push(...keys);
        console.log(`Found ${keys.length} from ${url}`);
      }
    } catch (e) {
      console.log(`Skipped ${url}`);
    }
  }

  const unique = [...new Set(collected)];
  console.log(`Total unique nodes: ${unique.length}`);

  if (unique.length === 0) {
    console.log("No nodes fetched. Exiting.");
    return;
  }

  const outputNodes = [];
  const limit = Math.min(unique.length, 35);

  for (let i = 0; i < limit; i++) {
    const base = unique[i].split('#')[0];
    outputNodes.push(`${base}#SG-AI-VLESS-${String(i + 1).padStart(2, '0')}`);
  }

  const base64Data = Buffer.from(outputNodes.join('\n')).toString('base64');
  fs.writeFileSync('sub.txt', base64Data, 'utf-8');
  console.log(`Successfully wrote ${outputNodes.length} nodes into sub.txt`);
}

main();
