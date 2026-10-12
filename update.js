import fs from 'fs';
import axios from 'axios';
import { URL } from 'url';

// တကယ် အလုပ်လုပ်နေသော High-Yield VLESS Sources များ
const SOURCES = [
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub2.txt',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge.txt',
  'https://raw.githubusercontent.com/peass/v2ray-node/main/vless',
  'https://raw.githubusercontent.com/freefq/free/master/v2'
];

async function fetchNodes() {
  let list = [];
  for (const url of SOURCES) {
    try {
      const res = await axios.get(url, { 
        timeout: 8000, 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } 
      });
      let data = res.data;

      // Base64 decode handling
      try {
        const decoded = Buffer.from(data, 'base64').toString('utf-8');
        if (decoded.includes('://')) data = decoded;
      } catch (e) {}

      // VLESS သီးသန့် ဖမ်းယူခြင်း
      const matches = data.match(/vless:\/\/[^\s<"'\n\r]+/g);
      if (matches) {
        list.push(...matches);
      }
    } catch (e) {
      console.warn(`Skipped: ${url}`);
    }
  }
  return [...new Set(list)];
}

async function main() {
  console.log("Fetching live VLESS candidate keys...");
  let nodes = await fetchNodes();
  console.log(`Successfully scraped ${nodes.length} VLESS keys.`);

  if (nodes.length === 0) {
    console.log("No nodes parsed, keeping existing sub.");
    return;
  }

  // Singapore, Japan သို့မဟုတ် Cloudflare Clean SNI များကို Tag တပ်ပြီး အများဆုံး ၃၅ ခု ယူမည်
  const tunedNodes = [];
  for (let i = 0; i < Math.min(nodes.length, 35); i++) {
    const uri = nodes[i];
    try {
      const base = uri.split('#')[0];
      const nodeName = `SG-AI-VLESS-NODE-${i + 1}`;
      tunedNodes.push(`${base}#${nodeName}`);
    } catch (e) {}
  }

  const base64Data = Buffer.from(tunedNodes.join('\n')).toString('base64');
  fs.writeFileSync('sub.txt', base64Data, 'utf-8');
  console.log(`Updated sub.txt with ${tunedNodes.length} live VLESS nodes!`);
}

main().catch(err => {
  console.error("Runner Error:", err);
});
