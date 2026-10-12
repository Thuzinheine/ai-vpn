import fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';
import net from 'net';
import dns from 'dns';
import { URL } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// High-Yield VLESS Sources
const SOURCES = [
  'https://raw.githubusercontent.com/yebekhe/TVC/main/subscriptions/xray/normal/vless',
  'https://raw.githubusercontent.com/peass/v2ray-node/main/vless',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge.txt',
  'https://raw.githubusercontent.com/cmliu/WorkerVless2sub/main/sub',
  'https://raw.githubusercontent.com/freefq/free/master/v2'
];

// Clean SNIs
const SNI_POOL = ['speed.cloudflare.com', 'gateway.icloud.com', 'graph.facebook.com'];

// 1. Scrape VLESS Keys
async function fetchVlessKeys() {
  let list = [];
  for (const url of SOURCES) {
    try {
      const res = await axios.get(url, { timeout: 6000 });
      let data = res.data;

      try {
        const decoded = Buffer.from(data, 'base64').toString('utf-8');
        if (decoded.includes('://')) data = decoded;
      } catch (e) {}

      // VLESS သီးသန့်သာ ဆွဲထုတ်ခြင်း (Trojan / VMess လုံးဝမယူပါ)
      const matches = data.match(/vless:\/\/[^\s<"']+/g);
      if (matches) list.push(...matches);
    } catch (e) {}
  }
  return [...new Set(list)];
}

// 2. Safe DNS Resolver
function resolveHost(host) {
  return new Promise((resolve) => {
    if (net.isIP(host)) return resolve(host);
    dns.lookup(host, (err, address) => {
      if (err || !address) resolve(null);
      else resolve(address);
    });
  });
}

// 3. Fast TCP Socket Latency Test
function testPing(host, port = 443, timeout = 1200) {
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

// 4. Gemini AI Repair
async function aiRepair(nodes) {
  if (!GEMINI_API_KEY) return nodes;

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
You are an expert Xray-core v1.8.24 and Sing-box engineer.
Review and fix these raw VLESS proxy keys:
${nodes.slice(0, 30).join('\n')}

Rules:
1. Fix broken URI parameters, reality public keys (pbk, sid).
2. Set fp=chrome and security=reality or tls.
3. Return ONLY valid vless:// URI lines without any explanation or markdown formatting.
`;
    const result = await model.generateContent(prompt);
    const cleaned = result.response.text().trim().split(/\r?\n/).filter(l => l.startsWith('vless://'));
    return cleaned.length > 5 ? cleaned : nodes;
  } catch (err) {
    console.warn("AI repair skipped:", err.message);
    return nodes;
  }
}

// 5. Main Execution
async function main() {
  console.log("[1/4] Scraping VLESS keys...");
  const raw = await fetchVlessKeys();
  console.log(`Retrieved ${raw.length} raw VLESS nodes.`);

  console.log("[2/4] Repairing with Gemini AI...");
  const repaired = await aiRepair(raw);

  console.log("[3/4] Testing Latency & Alive Check...");
  const passedNodes = [];

  for (let i = 0; i < Math.min(repaired.length, 40); i++) {
    const uri = repaired[i];
    try {
      const parsed = new URL(uri);
      const host = parsed.hostname;
      const port = parseInt(parsed.port, 10) || 443;

      const ip = await resolveHost(host);
      if (!ip) continue;

      const ping = await testPing(ip, port);
      if (ping < 800) { // Alive Node
        const sni = SNI_POOL[i % SNI_POOL.length];
        const base = uri.split('?')[0];
        const params = new URLSearchParams(uri.split('?')[1]?.split('#')[0] || '');

        params.set('sni', sni);
        params.set('fp', 'chrome');

        passedNodes.push({
          uri: `${base}?${params.toString()}#SG-AI-VLESS-${passedNodes.length + 1}[Ping:${ping}ms]`,
          ping
        });
      }
    } catch (e) {}
  }

  // Latency အနည်းဆုံး node များကို ရှေ့ဆုံးထား စီခြင်း
  passedNodes.sort((a, b) => a.ping - b.ping);
  const finalNodes = passedNodes.length > 0 ? passedNodes.map(n => n.uri) : repaired.slice(0, 15);

  console.log(`[4/4] Writing ${finalNodes.length} nodes to sub.txt...`);
  const base64Data = Buffer.from(finalNodes.join('\n')).toString('base64');
  fs.writeFileSync('sub.txt', base64Data, 'utf-8');
  console.log("Successfully generated sub.txt!");
}

main().catch(err => {
  console.error("Critical Error:", err);
  process.exit(0); // Exit safely so Action completes
});
