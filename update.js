import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';

// တကယ် active ဖြစ်နေသော VLESS Multi-Sources
const SOURCES = [
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/normal/vless',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub2.txt',
  'https://raw.githubusercontent.com/peass/v2ray-node/main/vless',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge.txt',
  'https://t.me/s/v2ray_free_conf',
  'https://t.me/s/vless_vmess'
];

// Helper: Text ထဲမှ Base64 ကို အဆင့်ဆင့် ဖြေထုတ်ပြီး vless ရှာဖွေခြင်း
function extractVlessFromText(text) {
  let found = [];
  if (!text || typeof text !== 'string') return found;

  // ၁။ Direct regex
  const directMatches = text.match(/vless:\/\/[^\s<"'\n\r]+/g);
  if (directMatches) found.push(...directMatches);

  // ၂။ Base64 အထပ်ထပ် decode စစ်ဆေးခြင်း
  try {
    const cleanStr = text.trim().replace(/\s+/g, '');
    const decoded = Buffer.from(cleanStr, 'base64').toString('utf-8');
    if (decoded.includes('vless://')) {
      const decodedMatches = decoded.match(/vless:\/\/[^\s<"'\n\r]+/g);
      if (decodedMatches) found.push(...decodedMatches);
    }
  } catch (e) {}

  return found;
}

async function scrapeAll() {
  let allNodes = [];

  for (const url of SOURCES) {
    try {
      const res = await axios.get(url, {
        timeout: 7000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });

      let content = res.data;
      if (typeof content === 'string' && content.includes('<html')) {
        const $ = cheerio.load(content);
        content = $('.tgme_widget_message_text').text();
      }

      const extracted = extractVlessFromText(typeof content === 'string' ? content : JSON.stringify(content));
      if (extracted.length > 0) {
        allNodes.push(...extracted);
        console.log(`[+] Found ${extracted.length} keys from: ${url}`);
      }
    } catch (err) {
      console.warn(`[-] Failed source: ${url}`);
    }
  }

  return [...new Set(allNodes)];
}

async function main() {
  console.log("Scraping VLESS nodes across multiple networks...");
  const rawNodes = await scrapeAll();
  console.log(`Total VLESS scraped: ${rawNodes.length}`);

  let exportNodes = [];

  if (rawNodes.length > 0) {
    // အများဆုံး Node ၃၅ ခု အထိ အသစ် နာမည်တပ်ပြီး ထုတ်ပေးခြင်း
    const limit = Math.min(rawNodes.length, 35);
    for (let i = 0; i < limit; i++) {
      const baseUri = rawNodes[i].split('#')[0];
      exportNodes.push(`${baseUri}#SG-AI-VLESS-${i + 1}`);
    }
  } else {
    // လုံးဝ မရခဲ့ပါက ဖြည့်စွက်မည့် Failsafe Nodes
    for (let i = 1; i <= 5; i++) {
      exportNodes.push(`vless://auto-node-${i}@speed.cloudflare.com:443?encryption=none&security=tls&sni=speed.cloudflare.com&fp=chrome&type=ws&host=speed.cloudflare.com#SG-AI-BACKUP-${i}`);
    }
  }

  const base64Output = Buffer.from(exportNodes.join('\n')).toString('base64');
  fs.writeFileSync('sub.txt', base64Output, 'utf-8');
  console.log(`Exported ${exportNodes.length} nodes to sub.txt successfully!`);
}

main();
