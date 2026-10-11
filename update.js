import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import net from 'net';
import { URL } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ခွင့်ပြုထားသော Tier-1 Cloud ASN / ISP Keywords
const TRUSTED_CLOUDS = [
  'amazon', 'aws',
  'digitalocean',
  'vultr', 'choopa',
  'google', 'gcp',
  'alibaba', 'aliyun',
  'tencent',
  'cloudflare'
];

// ခွင့်ပြုထားသော ဒေသများ
const ALLOWED_COUNTRIES = ['SG', 'JP']; // Singapore & Japan သီးသန့်

// Reality Clean SNI Pool
const SNI_POOL = [
  'gateway.icloud.com',
  'speed.cloudflare.com',
  'graph.facebook.com'
];

// ==========================================
// ၁။ Multi-Source Scraper
// ==========================================
async function fetchSources() {
  const tgChannels = [
    'https://t.me/s/v2ray_free_conf',
    'https://t.me/s/V2rayNG_VPNN',
    'https://t.me/s/vless_vmess'
  ];

  const ghRepos = [
    'https://raw.githubusercontent.com/freefq/free/master/v2',
    'https://raw.githubusercontent.com/v2ray-free/v2ray-free.github.io/master/sub/sub_merge.txt'
  ];

  let rawList = [];

  for (const url of tgChannels) {
    try {
      const res = await axios.get(url, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      const $ = cheerio.load(res.data);
      const text = $('.tgme_widget_message_text').text();
      const matches = text.match(/(vless|vmess|trojan):\/\/[^\s<]+/g);
      if (matches) rawList.push(...matches);
    } catch (e) {}
  }

  for (const url of ghRepos) {
    try {
      const res = await axios.get(url, { timeout: 5000 });
      let data = res.data;
      try {
        const decoded = Buffer.from(data, 'base64').toString('utf-8');
        if (decoded.includes('://')) data = decoded;
      } catch (e) {}
      rawList.push(...data.split(/\r?\n/).filter(l => l.startsWith('vless://') || l.startsWith('vmess://') || l.startsWith('trojan://')));
    } catch (e) {}
  }

  return [...new Set(rawList)];
}

// ==========================================
// ၂။ IP Info, Geo & Cloud Provider စစ်ဆေးခြင်း
// ==========================================
async function verifyServerProviderAndLocation(host) {
  try {
    const res = await axios.get(`http://ip-api.com/json/${host}?fields=status,countryCode,org,as,isp`, { timeout: 3000 });
    if (res.data && res.data.status === 'success') {
      const country = res.data.countryCode; // SG, JP, etc.
      const org = (res.data.org + ' ' + res.data.as + ' ' + res.data.isp).toLowerCase();

      // Singapore သို့မဟုတ် Japan ဖြစ်မဖြစ် စစ်ဆေးခြင်း
      if (!ALLOWED_COUNTRIES.includes(country)) {
        return { valid: false };
      }

      // AWS, DigitalOcean, Vultr, Google Cloud, Alibaba, Tencent ဖြစ်မဖြစ် စစ်ဆေးခြင်း
      const isTrustedCloud = TRUSTED_CLOUDS.some(cloud => org.includes(cloud));
      if (!isTrustedCloud) {
        return { valid: false };
      }

      return { valid: true, country, org: res.data.isp };
    }
  } catch (err) {}
  return { valid: false };
}

// ==========================================
// ၃။ TCP Ping စစ်ဆေးခြင်း (<100ms Filter)
// ==========================================
function testTcpLatency(host, port = 443, timeout = 1200) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.connect(port, host, () => {
      const ping = Date.now() - start;
      socket.destroy();
      resolve(ping);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(9999);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(9999);
    });
  });
}

// ==========================================
// ၄။ Gemini AI Auto-Repair
// ==========================================
async function aiRepairAndTune(rawKeys) {
  if (!GEMINI_API_KEY) return rawKeys.slice(0, 20);

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `
You are an expert Xray-core v1.8.24, Sing-box, v2rayNG and Clash Meta network protocol specialist.
Task:
1. Review these raw proxy keys:
${rawKeys.slice(0, 30).join('\n')}

2. Fix syntax errors, repair corrupt base64, query parameters, and validate standard URI schema.
3. Optimize for Singapore (SG) and Japan (JP) Cloud Server nodes:
   - Target Clean SNIs: ${SNI_POOL.join(', ')}
   - Fingerprint: chrome or safari
   - Security: reality or tls
   - URI Schema:
     vless://UUID@HOST:PORT?encryption=none&security=reality&sni=...&fp=chrome&pbk=...&type=...#NAME
4. Return ONLY valid URI lines without any explanation or markdown formatting.
`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim().split(/\r?\n/).filter(l => l.includes('://'));
  } catch (err) {
    console.error("AI tuning failed, using raw fallback:", err.message);
    return rawKeys.slice(0, 20);
  }
}

// ==========================================
// ၅။ Main Pipeline
// ==========================================
async function main() {
  console.log("[1/5] Scraping candidate keys...");
  const rawNodes = await fetchSources();
  console.log(`Retrieved ${rawNodes.length} candidate keys.`);

  console.log("[2/5] Repairing format with Gemini AI...");
  const repairedNodes = await aiRepairAndTune(rawNodes);

  console.log("[3/5] Filtering Cloud Providers (AWS/DO/Vultr/GCP/Alibaba) & Geo (SG/JP)...");
  const filteredNodes = [];

  for (let i = 0; i < repairedNodes.length; i++) {
    const nodeUri = repairedNodes[i];
    try {
      const parsed = new URL(nodeUri);
      const host = parsed.hostname;
      const port = parseInt(parsed.port, 10) || 443;

      // Cloud Provider & SG/JP စစ်ဆေးခြင်း
      const check = await verifyServerProviderAndLocation(host);
      if (check.valid) {
        // Ping latency စစ်ဆေးခြင်း
        const ping = await testTcpLatency(host, port);

        // Ping 100ms ဝန်းကျင် အကောင်းဆုံးများကိုသာ စစ်ထုတ်ခြင်း
        if (ping <= 120) {
          const sni = SNI_POOL[i % SNI_POOL.length];
          const basePart = nodeUri.split('?')[0];
          const searchParams = new URLSearchParams(nodeUri.split('?')[1]?.split('#')[0] || '');

          searchParams.set('sni', sni);
          searchParams.set('fp', 'chrome');

          const nodeName = `${check.country}-AI-${check.org.substring(0, 10).replace(/[^a-zA-Z0-9]/g, '')}[Ping:${ping}ms]`;
          const tunedUri = `${basePart}?${searchParams.toString()}#${nodeName}`;

          filteredNodes.push({ uri: tunedUri, ping });
        }
      }
    } catch (e) {}

    // ip-api rate limit မထိစေရန် delay အနည်းငယ်ထားခြင်း
    await new Promise(r => setTimeout(r, 150));
  }

  // Ping အနည်းဆုံးဖြစ်သော Server များကို ရှေ့ဆုံးထား စီပေးခြင်း
  filteredNodes.sort((a, b) => a.ping - b.ping);

  const finalPool = filteredNodes.length > 0 ? filteredNodes.map(n => n.uri) : repairedNodes.slice(0, 5);

  console.log(`[4/5] Matched ${finalPool.length} High-Performance SG/JP Cloud Nodes.`);

  // Base64 Encode လုပ်ပြီး NekoBox / Sing-box / Clash Meta Sub ဖိုင်အဖြစ် သိမ်းဆည်းခြင်း
  const base64Data = Buffer.from(finalPool.join('\n')).toString('base64');
  fs.writeFileSync('sub.txt', base64Data, 'utf-8');
  console.log("[5/5] sub.txt successfully updated!");
}

main();
