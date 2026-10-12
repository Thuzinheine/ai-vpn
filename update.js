import fs from 'fs';
import axios from 'axios';

// High-Yield Active VLESS Aggregator Sources
const SOURCES = [
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/normal/vless',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub2.txt',
  'https://raw.githubusercontent.com/peass/v2ray-node/main/vless',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge.txt',
  'https://raw.githubusercontent.com/mhayat/V2Ray-Configs/main/vless.txt',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/protocols/vless',
  'https://raw.githubusercontent.com/Epodonios/v2ray-configs/main/All_Configs_Sub.txt',
  'https://raw.githubusercontent.com/freefq/free/master/v2'
];

function extractVless(rawText) {
  let list = [];
  if (!rawText || typeof rawText !== 'string') return list;

  // ၁။ Direct text regex match
  const directMatches = rawText.match(/vless:\/\/[^\s<"'\n\r]+/g);
  if (directMatches) list.push(...directMatches);

  // ၂။ Base64 decode ပြီး ထပ်မံ ရှာဖွေခြင်း
  try {
    const cleanStr = rawText.trim().replace(/\s+/g, '');
    const decoded = Buffer.from(cleanStr, 'base64').toString('utf-8');
    const decodedMatches = decoded.match(/vless:\/\/[^\s<"'\n\r]+/g);
    if (decodedMatches) list.push(...decodedMatches);
  } catch (e) {}

  return list;
}

async function main() {
  console.log("Scraping high-yield VLESS nodes...");
  let collected = [];

  for (const url of SOURCES) {
    try {
      const res = await axios.get(url, {
        timeout: 9000,
        headers: { 'User-Agent': 'v2rayNG/1.8.12' }
      });
      const found = extractVless(res.data);
      if (found.length > 0) {
        collected.push(...found);
        console.log(`[+] Got ${found.length} nodes from: ${url}`);
      }
    } catch (e) {
      console.log(`[-] Timed out / failed: ${url}`);
    }
  }

  const unique = [...new Set(collected)];
  console.log(`Total collected unique VLESS nodes: ${unique.length}`);

  if (unique.length === 0) {
    console.log("No nodes collected. Exiting.");
    return;
  }

  // Node အရေအတွက် အနည်းဆုံး ၅၀ အထိ စုစည်းမည်
  const outputNodes = [];
  const targetCount = Math.min(unique.length, 50);

  for (let i = 0; i < targetCount; i++) {
    const raw = unique[i];
    const baseUri = raw.split('#')[0];
    const country = (i % 2 === 0) ? 'SG' : 'JP';
    outputNodes.push(`${baseUri}#${country}-AI-VLESS-${String(i + 1).padStart(2, '0')}`);
  }

  const base64Data = Buffer.from(outputNodes.join('\n')).toString('base64');
  fs.writeFileSync('sub.txt', base64Data, 'utf-8');
  console.log(`Done! Exported ${outputNodes.length} VLESS nodes to sub.txt.`);
}

main();
