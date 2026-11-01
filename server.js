const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const TOKEN_SECRET = process.env.TOKEN_SECRET || "";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const WEBHOOK = process.env.DISCORD_WEBHOOK_URL || "";

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
  console.error("Set ADMIN_PASSWORD to a unique password of at least 12 characters.");
  process.exit(1);
}
if (!TOKEN_SECRET || TOKEN_SECRET.length < 32) {
  console.error("Set TOKEN_SECRET to a random secret of at least 32 characters.");
  process.exit(1);
}

fs.mkdirSync(DATA_DIR, { recursive: true });

const defaultStore = {
  settings: {
    keySystemEnabled: true,
    autoGenerateEnabled: true,
    discordEnabled: true,
    usageCountEnabled: true,
    keyDurationHours: 24,
    discordInvite: "https://discord.gg/your-invite",
    totalUsers: 0,
    usedUserIds: []
  },
  keys: [],
  logs: []
};

function loadStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { ...defaultStore, ...parsed, settings: { ...defaultStore.settings, ...(parsed.settings || {}) } };
  } catch {
    return structuredClone(defaultStore);
  }
}
let store = loadStore();

function saveStore() {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false });
app.use("/api", apiLimiter);

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest();
  let actual;
  try { actual = Buffer.from(sig, "base64url"); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}
function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!verifyToken(token)) return res.status(401).json({ error: "กรุณาเข้าสู่ระบบแอดมินใหม่" });
  next();
}
function makeKey() {
  const part = () => crypto.randomBytes(3).toString("hex").toUpperCase();
  return `SULTAN-${part()}-${part()}`;
}
function addLog(type, description, extra = {}) {
  store.logs.unshift({ id: crypto.randomUUID(), type, description, at: new Date().toISOString(), ...extra });
  store.logs = store.logs.slice(0, 200);
  saveStore();
}
async function discord(title, description, fields = []) {
  if (!store.settings.discordEnabled || !WEBHOOK) return;
  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title, description, color: 0xDC2626,
          fields: fields.map(f => ({ name: f.name, value: String(f.value), inline: true })),
          footer: { text: "SULTANIQZ KEY SYSTEM" },
          timestamp: new Date().toISOString()
        }]
      })
    });
  } catch (e) { console.error("Discord webhook error:", e.message); }
}

app.get("/api/public-config", (req, res) => {
  res.json({
    keySystemEnabled: store.settings.keySystemEnabled,
    discordInvite: store.settings.discordInvite,
    totalUsers: store.settings.usageCountEnabled ? store.settings.totalUsers : null
  });
});

app.post("/api/get-key", async (req, res) => {
  if (!store.settings.keySystemEnabled) return res.status(403).json({ error: "ระบบรับคีย์ปิดอยู่ชั่วคราว" });
  if (!store.settings.autoGenerateEnabled) return res.status(403).json({ error: "ระบบสร้างคีย์อัตโนมัติปิดอยู่" });
  const key = makeKey();
  const hours = Math.max(1, Math.min(8760, Number(store.settings.keyDurationHours) || 24));
  store.keys.push({ key, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + hours * 3600000).toISOString(), used: false, usedBy: null, usedAt: null });
  addLog("key", "New key generated", { keyMasked: key.slice(0, 12) + "****" });
  await discord("มีการสร้างคีย์ใหม่", "ระบบสร้างคีย์อัตโนมัติสำเร็จ", [{ name: "อายุคีย์", value: `${hours} ชั่วโมง` }]);
  res.json({ key, expiresAt: store.keys[store.keys.length - 1].expiresAt });
});

app.post("/api/verify-key", (req, res) => {
  const key = String(req.body.key || "").trim().toUpperCase();
  if (!store.settings.keySystemEnabled) return res.status(403).json({ error: "ระบบคีย์ปิดอยู่" });
  const record = store.keys.find(k => k.key === key);
  if (!record) return res.status(404).json({ error: "ไม่พบคีย์นี้" });
  if (Date.now() > Date.parse(record.expiresAt)) return res.status(410).json({ error: "คีย์หมดอายุแล้ว" });
  res.json({ valid: true, message: "คีย์ถูกต้อง", expiresAt: record.expiresAt });
});

// Called by the script after it has actually started. userId should be a stable Roblox user ID if available.
app.post("/api/usage", async (req, res) => {
  const key = String(req.body.key || "").trim().toUpperCase();
  const userId = String(req.body.userId || "").trim().slice(0, 80);
  const username = String(req.body.username || "Unknown").trim().slice(0, 40);
  if (!key || !userId) return res.status(400).json({ error: "ต้องส่ง key และ userId" });
  const record = store.keys.find(k => k.key === key);
  if (!record || Date.now() > Date.parse(record.expiresAt)) return res.status(403).json({ error: "คีย์ไม่ถูกต้องหรือหมดอายุ" });
  if (!store.settings.usageCountEnabled) return res.json({ ok: true, counted: false });
  const isNew = !store.settings.usedUserIds.includes(userId);
  if (isNew) {
    store.settings.usedUserIds.push(userId);
    store.settings.totalUsers += 1;
  }
  record.used = true;
  record.usedBy = username;
  record.usedAt = new Date().toISOString();
  addLog("usage", "Script usage reported", { username, userId, isNewUser: isNew });
  await discord("มีคนรันสคริปต์", "ได้รับรายงานการใช้งานจากสคริปต์", [
    { name: "ผู้เล่น", value: username },
    { name: "User ID", value: userId },
    { name: "ผู้ใช้ไม่ซ้ำทั้งหมด", value: store.settings.totalUsers }
  ]);
  res.json({ ok: true, counted: true, totalUsers: store.settings.totalUsers, newUser: isNew });
});

app.post("/api/admin/login", (req, res) => {
  const password = String(req.body.password || "");
  const a = Buffer.from(password);
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });
  res.json({ token: sign({ role: "admin", exp: Date.now() + 12 * 60 * 60 * 1000 }) });
});

app.get("/api/admin/data", requireAdmin, (req, res) => {
  res.json({
    settings: store.settings,
    keys: store.keys.slice(-100).reverse().map(k => ({ ...k, key: k.key })),
    logs: store.logs.slice(0, 100)
  });
});

app.patch("/api/admin/settings", requireAdmin, (req, res) => {
  const allowed = ["keySystemEnabled", "autoGenerateEnabled", "discordEnabled", "usageCountEnabled"];
  for (const name of allowed) if (typeof req.body[name] === "boolean") store.settings[name] = req.body[name];
  if (req.body.keyDurationHours !== undefined) store.settings.keyDurationHours = Math.max(1, Math.min(8760, Number(req.body.keyDurationHours) || 24));
  if (typeof req.body.discordInvite === "string" && /^https:\/\/(discord\.gg|discord\.com\/invite)\//.test(req.body.discordInvite)) store.settings.discordInvite = req.body.discordInvite;
  if (req.body.totalUsers !== undefined) store.settings.totalUsers = Math.max(0, Math.floor(Number(req.body.totalUsers) || 0));
  saveStore();
  res.json({ ok: true, settings: store.settings });
});

app.post("/api/admin/keys", requireAdmin, (req, res) => {
  const key = makeKey();
  const hours = Math.max(1, Math.min(8760, Number(req.body.hours) || Number(store.settings.keyDurationHours) || 24));
  const record = { key, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + hours * 3600000).toISOString(), used: false, usedBy: null, usedAt: null };
  store.keys.push(record);
  addLog("admin-key", "Admin generated a key", { keyMasked: key.slice(0, 12) + "****" });
  res.json(record);
});

app.delete("/api/admin/keys/:key", requireAdmin, (req, res) => {
  const before = store.keys.length;
  store.keys = store.keys.filter(k => k.key !== req.params.key);
  saveStore();
  res.json({ ok: store.keys.length !== before });
});

app.post("/api/admin/discord-test", requireAdmin, async (req, res) => {
  if (!WEBHOOK) return res.status(400).json({ error: "ยังไม่ได้ตั้ง DISCORD_WEBHOOK_URL บนโฮสต์" });
  await discord("ทดสอบระบบ SULTANIQZ", "Discord webhook เชื่อมต่อแล้ว");
  res.json({ ok: true });
});

app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`Sultaniqz Key System running on port ${PORT}`));
