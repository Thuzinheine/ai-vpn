import fs from 'fs';
import axios from 'axios';

// GitHub IP များမှ တိုက်ရိုက် ဝင်ရောက်ဖတ်ရှုနိုင်သော Live Dynamic VLESS Aggregators
const ENDPOINTS = [
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub2.txt',
  'https://raw.githubusercontent.com/peass/v2ray-node/main/vless',
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/normal/vless',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge.txt'
];

// Base64 decode လုပ်ရန် သို့မဟုတ် Raw စာသားမှ vless ဖမ်းယူရန်
function parseVless(content) {
  let list = [];
  if (!content || typeof content !== 'string') return list;

  // 1. တိုက်ရိုက် vless ပါမပါ စစ်ဆေးခြင်း
  const direct = content.match(/vless:\/\/[^\s<"'\n\r]+/g);
  if (direct) list.push(...direct);

  // 2. Base64 ဖြည်ပြီး ရှာဖွေခြင်း
  try {
    const clean = content.trim().replace(/\s+/g, '');
    const decoded = Buffer.from(clean, 'base64').toString('utf-8');
    const matched = decoded.match(/vless:\/\/[^\s<"'\n\r]+/g);
    if (matched) list.push(...matched);
  } catch (e) {}

  return list;
}

async function scrapeLiveVless() {
  let collection = [];

  for (const url of ENDPOINTS) {
    try {
      const res = await axios.get(url, {
        timeout: 8000,
        headers: {
          'User-Agent': 'v2rayNG/1.8.12'
        }
      });
      const keys = parseVless(res.data);
      if (keys.length > 0) {
        collection.push(...keys);
        console.log(`[+] Scraped ${keys.length} VLESS keys from ${url}`);
      }
    } catch (e) {
      console.log(`[-] Could not fetch from ${url}`);
    }
  }

  return [...new Set(collection)];
}

async function run() {
  console.log("Starting Automated VLESS Scraper...");
  const rawNodes = await scrapeLiveVless();
  console.log(`Total live nodes collected: ${rawNodes.length}`);

  if (rawNodes.length === 0) {
    console.error("No nodes collected. Preserving previous sub file.");
    return;
  }

  // Node များကို စနစ်တကျ Tag အသစ်တပ်ဆင်ခြင်း (အများဆုံး အခု ၄၀)
  const outputNodes = [];
  const total = Math.min(rawNodes.length, 40);

  for (let i = 0; i < total; i++) {
    const nodeUri = rawNodes[i];
    const baseUri = nodeUri.split('#')[0];
    const label = `SG-AUTO-VLESS-${String(i + 1).padStart(2, '0')}`;
    outputNodes.push(`${baseUri}#${label}`);
  }

  // NekoBox/Sing-box ဖတ်နိုင်မည့် Base64 ဖြင့် sub.txt သို့ ရေးသားခြင်း
  const base64Sub = Buffer.from(outputNodes.join('\n')).toString('base64');
  fs.writeFileSync('sub.txt', base64Sub, 'utf-8');
  console.log(`Success! Updated sub.txt with ${outputNodes.length} dynamic VLESS nodes.`);
}

run();
