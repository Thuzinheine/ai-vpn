import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import net from 'net';
import { URL } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("FATAL ERROR: GEMINI_API_KEY environment variable is not defined!");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || '');

// Southeast Asia / Myanmar Route Optimization Pool
const ROUTE_OPTIMIZATION = {
  social: {
    sni: 'graph.facebook.com',
    fp: 'chrome',
    cleanIps: ['104.16.132.229', '172.67.182.112', '104.18.2.161']
  },
  gaming: {
    sni: 'speed.cloudflare.com',
    fp: 'safari',
    cleanIps: ['162.159.192.1', '104.16.85.20', '172.64.155.209']
  },
  stream: {
    sni: 'gateway.icloud.com',
    fp: 'firefox',
    cleanIps: ['104.17.209.9', '104.19.154.241', '104.21.48.1']
  }
};

// ========================================================
// 1. Multi-Source Scraper (Telegram Archives + GitHub)
// ========================================================
async function scrapeTelegramChannels() {
  const telegramChannels = [
    'https://t.me/s/v2ray_free_conf',
    'https://t.me/s/V2rayNG_VPNN',
    'https://t.me/s/vless_vmess'
  ];

  const rawKeys = [];
  for (const channelUrl of telegramChannels) {
    try {
      const res = await axios.get(channelUrl, {
        timeout: 4000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const $ = cheerio.load(res.data);
      const text = $('.tgme_widget_message_text').text();
      const matches = text.match(/(vless|vmess|trojan):\/\/[^\s<]+/g);
      if (matches) rawKeys.push(...matches);
    } catch (err) {
      console.warn(`[Scraper] Skipped/Failed Telegram: ${channelUrl}`);
    }
  }
  return rawKeys;
}

async function scrapeGitHubSources() {
  const gitHubRepos = [
    'https://raw.githubusercontent.com/freefq/free/master/v2',
    'https://raw.githubusercontent.com/v2ray-free/v2ray-free.github.io/master/sub/sub_merge.txt'
  ];

  const rawKeys = [];
  for (const url of gitHubRepos) {
    try {
      const res = await axios.get(url, { timeout: 4000 });
      let data = res.data;

      // Base64 decode attempt
      try {
        const decoded = Buffer.from(data, 'base64').toString('utf-8');
        if (decoded.includes('://')) data = decoded;
      } catch (e) {}

      const lines = data.split(/\r?\n/).filter(line => 
        line.startsWith('vless://') || line.startsWith('vmess://') || line.startsWith('trojan://')
      );
      rawKeys.push(...lines);
    } catch (err) {
      console.warn(`[Scraper] Skipped/Failed GitHub: ${url}`);
    }
  }
  return rawKeys;
}

// ========================================================
// 2. Real TCP Socket Ping Filter (<100ms Target)
// ========================================================
function measureTcpPing(host, port, timeout = 1000) {
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

async function testNodeLatency(keyUri) {
  try {
    const parsed = new URL(keyUri);
    const host = parsed.hostname;
    const port = parseInt(parsed.port, 10) || 443;
    const ping = await measureTcpPing(host, port);
    return { uri: keyUri, ping };
  } catch (err) {
    return { uri: keyUri, ping: 9999 };
  }
}

// ========================================================
// 3. Gemini 1.5/Flash AI Auto-Repair & Route Injection
// ========================================================
async function aiAutoRepair(rawKeys, purpose) {
  if (!GEMINI_API_KEY) {
    console.warn("[AI Engine] Missing Gemini API key, using raw keys as fallback.");
    return rawKeys.slice(0, 10);
  }

  const targetConfig = ROUTE_OPTIMIZATION[purpose] || ROUTE_OPTIMIZATION.social;

  const prompt = `
You are a networking core engineer for Xray v1.8.24 and Sing-box / NekoBox.
Review and fix the following raw proxy nodes:

${rawKeys.slice(0, 20).join('\n')}

Rules:
1. Fix corrupted syntax, bad URI encodings, broken reality pbk / sid parameters.
2. Optimize for Southeast Asia / Myanmar route targeting purpose [${purpose.toUpperCase()}]:
   - SNI: ${targetConfig.sni}
   - Fingerprint: ${targetConfig.fp}
   - Security: reality or tls
   - Transport: grpc or tcp
3. Ensure strict compliance with standard Xray URIs:
   vless://UUID@HOST:PORT?encryption=none&security=reality&sni=...&fp=...&pbk=...&type=...#NAME
4. Return ONLY valid URI lines. Do NOT write conversational text, markdown blocks, or commentary.
`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const output = result.response.text().trim();
    return output.split(/\r?\n/).filter(line => 
      line.startsWith('vless://') || line.startsWith('vmess://') || line.startsWith('trojan://')
    );
  } catch (err) {
    console.error("[Gemini AI Error]:", err.message);
    return rawKeys.slice(0, 10);
  }
}

// ========================================================
// 4. API Endpoints
// ========================================================

// Dynamic Subscription for NekoBox / Sing-box / v2rayNG / Clash Meta
app.get('/sub', async (req, res) => {
  const purpose = (req.query.purpose || 'social').toLowerCase();
  console.log(`[Request] Triggered subscription generation for: ${purpose}`);

  // Fetch from sources
  const [tgKeys, ghKeys] = await Promise.all([
    scrapeTelegramChannels(),
    scrapeGitHubSources()
  ]);

  const rawPool = [...new Set([...tgKeys, ...ghKeys])];
  console.log(`[Scraper] Retrieved ${rawPool.length} raw node candidates.`);

  // Repair & Tune with Gemini
  const repairedNodes = await aiAutoRepair(rawPool, purpose);

  // Ping test alive nodes
  const pingTests = await Promise.all(
    repairedNodes.slice(0, 15).map(node => testNodeLatency(node))
  );

  const aliveNodes = pingTests
    .filter(item => item.ping < 800)
    .sort((a, b) => a.ping - b.ping)
    .map((item, idx) => {
      const cleanUri = item.uri.split('#')[0];
      return `${cleanUri}#SG-AI-${purpose.toUpperCase()}-${idx + 1}[Ping:${item.ping}ms]`;
    });

  // Fallback node if none survived
  const finalNodes = aliveNodes.length > 0 ? aliveNodes : [
    `vless://11111111-2222-3333-4444-555555555555@104.16.132.229:443?encryption=none&security=reality&sni=speed.cloudflare.com&fp=chrome&pbk=AI_FALLBACK&type=tcp#SG-AI-FALLBACK`
  ];

  // Encode Base64 (Standard Subscription Schema)
  const base64Data = Buffer.from(finalNodes.join('\n')).toString('base64');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Subscription-Userinfo', 'upload=0; download=0; total=107374182400; expire=0');
  res.setHeader('Profile-Update-Interval', '6'); // Auto update every 6 hours
  res.send(base64Data);
});

// Root & Health Status
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    engine: 'AI VPN Dynamic Sub Engine (Xray v1.8.24)',
    endpoints: {
      social: '/sub?purpose=social',
      gaming: '/sub?purpose=gaming',
      stream: '/sub?purpose=stream'
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AI VPN Sub Service running on port ${PORT}`);
});