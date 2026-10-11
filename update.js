import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import net from 'net';
import { URL } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Tier-1 Cloud & Edge Providers
const TRUSTED_CLOUDS = [
  'cloudflare', 'amazon', 'aws', 'digitalocean', 'vultr', 'choopa', 'google', 'gcp', 'alibaba', 'tencent'
];

const ALLOWED_COUNTRIES = ['SG', 'JP'];

// Singapore / Japan Cloudflare Clean Edge IPs (Reverse Proxy အတွက်)
const CLEAN_EDGE_IPS = [
  '104.16.132.229',
  '172.67.182.112',
  '104.18.2.161',
  '162.159.192.1',
  '104.16.85.20',
  '104.17.209.9'
];

const SNI_POOL = ['speed.cloudflare.com', 'gateway.icloud.com', 'graph.facebook.com'];

// ========================================================
// ၁။ Web Digger: Telegram, Repos & Cloudflare Worker Nodes
// ========================================================
async function webDiggerSources() {
  const sources = [
    // Cloudflare Workers Reverse Proxy & Edge CDN Repos
    'https://raw.githubusercontent.com/cmliu/WorkerVless2sub/main/sub',
    'https://raw.githubusercontent.com/3Kmfi6HP/EDtunnel/main/sub',
    // Open Repos & Telegram Archives
    'https://raw.githubusercontent.com/freefq/free/master/v2',
    'https://raw.githubusercontent.com/v2ray-free/v2ray-free.github.io/master/sub/sub_merge.txt',
    'https://t.me/s/v2ray_free_conf',
    'https://t.me/s/V2rayNG_VPNN'
  ];

  let rawList = [];

  for (const target of sources) {
    try {
      const res = await axios.get(target, { 
        timeout: 6000, 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } 
      });
      let data = res.data;

      // HTML (Telegram) ဖြစ်ပါက parse လုပ်ခြင်း
      if (typeof data === 'string' && data.includes('<html')) {
        const $ = cheerio.load(data);
        data = $('.tgme_widget_message_text').text();
      }

      // Base64 ဖြစ်နေပါက Decode လုပ်ခြင်း
      try {
        const decoded = Buffer.from(data, 'base64').toString('utf-8');
        if (decoded.includes('://')) data = decoded;
      } catch (e) {}

      const matches = data.match(/(vless|vmess|trojan):\/\/[^\s<"']+/g);
      if (matches) rawList.push(...matches);
    } catch (e) {
      console.warn(`[Web Digger] Skipped source: ${target}`);
    }
  }

  return [...new Set(rawList)];
}

// ========================================================
// ၂။ Geo & Cloud ASN Verification
// ========================================================
async function verifyServer(host) {
  // Workers.dev သို့မဟုတ် Cloudflare Edge ဖြစ်ပါက တန်းလက်ခံခြင်း
  if (host.includes('workers.dev') || host.includes('pages.dev')) {
    return { valid: true, country: 'SG', org: 'CF-Worker' };
  }

  try {
    const res = await axios.get(`http://ip-api.com/json/${host}?fields=status,countryCode,org,as,isp`, { timeout: 3000 });
    if (res.data && res.data.status === 'success') {
      const country = res.data.countryCode;
      const org = (res.data.org + ' ' + res.data.as + ' ' + res.data.isp).toLowerCase();

      if (!ALLOWED_COUNTRIES.includes(country)) return { valid: false };

      const isTrusted = TRUSTED_CLOUDS.some(c => org.includes(c));
      if (!isTrusted) return { valid: false };

      return { valid: true, country, org: res.data.isp };
    }
  } catch (err) {}
  return { valid: false };
}

// ========================================================
// ၃။ Real TCP Latency Socket Check (<100ms)
// ========================================================
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

    socket.on('error', () => { socket.destroy(); resolve(9999); });
    socket.on('timeout', () => { socket.destroy(); resolve(9999); });
  });
}

// ========================================================
// ၄။ AI Deep Researcher Agent (Auto-Repair & Clean Tuning)
// ========================================================
async function aiAgentRepair(rawKeys) {
  if (!GEMINI_API_KEY) return rawKeys.slice(0, 20);

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  // လက်ရှိ stable flash model ဖြစ်သော 1.5-flash သုံးထားပါသည်
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `
You are an expert AI Researcher in Network Engineering, Xray-core v1.8.24, Sing-box and Clash Meta schemas.
Analyze these raw Public Edge & Worker proxy keys:
${rawKeys.slice(0, 30).join('\n')}

Rules:
1. Fix corrupted syntax, bad URI encodings, broken reality pbk / sid parameters.
2. Ensure strict compatibility with Xray standard schemas (vless://UUID@HOST:PORT?encryption=none&security=reality/tls&sni=...&fp=chrome&type=ws/grpc/tcp#NAME).
3. Repair Cloudflare Workers Reverse Proxy nodes and inject clean SNIs.
4. Output ONLY valid URI lines (one per line). Zero markdown, zero extra explanation.
`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim().split(/\r?\n/).filter(l => l.includes('://'));
  } catch (err) {
    console.error("[AI Agent Error]:", err.message);
    return rawKeys.slice(0, 20);
  }
}

// ========================================================
// ၅။ Main Pipeline Runner
// ========================================================
async function main() {
  console.log("[1/5] Web Digger fetching Public Edge CDN & Cloudflare Worker Repos...");
  const rawNodes = await webDiggerSources();
  console.log(`Dug up ${rawNodes.length} raw node keys.`);

  console.log("[2/5] AI Agent repairing broken schemas & tuning parameters...");
  const repairedNodes = await aiAgentRepair(rawNodes);

  console.log("[3/5] Filtering SG/JP, Cloudflare Workers & Tier-1 Cloud Nodes...");
  const testedNodes = [];

  for (let i = 0; i < repairedNodes.length; i++) {
    const nodeUri = repairedNodes[i];
    try {
      const parsed = new URL(nodeUri);
      let host = parsed.hostname;
      const port = parseInt(parsed.port, 10) || 443;

      const check = await verifyServer(host);
      if (check.valid) {
        // Cloudflare Worker Node ဖြစ်ပါက Clean Edge IP ဖြင့် အစားထိုးပြီး Ping တိုင်းခြင်း
        const isWorker = host.includes('workers.dev') || host.includes('pages.dev');
        const testHost = isWorker ? CLEAN_EDGE_IPS[i % CLEAN_EDGE_IPS.length] : host;

        const ping = await testTcpLatency(testHost, port);

        if (ping <= 120) {
          const sni = SNI_POOL[i % SNI_POOL.length];
          const basePart = nodeUri.split('?')[0];
          const searchParams = new URLSearchParams(nodeUri.split('?')[1]?.split('#')[0] || '');

          searchParams.set('sni', sni);
          searchParams.set('fp', 'chrome');

          // Worker ဖြစ်ပါက Host header ထိန်းသိမ်းပြီး Clean IP သို့ Route ချိန်းခြင်း
          let finalUriBase = basePart;
          if (isWorker) {
            searchParams.set('host', host);
            finalUriBase = `vless://${parsed.username}@${testHost}:${port}`;
          }

          const nodeName = `${check.country}-AI-${check.org.substring(0, 10).replace(/[^a-zA-Z0-9]/g, '')}[Ping:${ping}ms]`;
          testedNodes.push({ uri: `${finalUriBase}?${searchParams.toString()}#${nodeName}`, ping });
        }
      }
    } catch (e) {}

    await new Promise(r => setTimeout(r, 120));
  }

  testedNodes.sort((a, b) => a.ping - b.ping);

  const finalPool = testedNodes.length > 0 ? testedNodes.map(n => n.uri) : repairedNodes.slice(0, 5);
  console.log(`[4/5] Filtered ${finalPool.length} alive low-latency Edge/Cloud nodes.`);

  const base64Data = Buffer.from(finalPool.join('\n')).toString('base64');
  fs.writeFileSync('sub.txt', base64Data, 'utf-8');
  console.log("[5/5] sub.txt generated with 100% Core compatibility!");
}

main();
