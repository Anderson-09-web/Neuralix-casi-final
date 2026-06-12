import axios from "axios";

const CARD_W = 700;
const CARD_H = 250;
const AVATAR_SIZE = 120;
const AVATAR_X = 40;
const AVATAR_Y = (CARD_H - AVATAR_SIZE) / 2;

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^0:0:0:0:0:0:0:1$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\./,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
  /^fc[0-9a-f]{2}:/i,
];

const BLOCKED_HOST_SUFFIXES = [".internal", ".local", ".localhost", ".corp", ".home", ".lan", ".intranet"];

function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    for (const pattern of BLOCKED_HOST_PATTERNS) {
      if (pattern.test(host)) return false;
    }
    for (const suffix of BLOCKED_HOST_SUFFIXES) {
      if (host === suffix.slice(1) || host.endsWith(suffix)) return false;
    }
    const port = u.port ? Number(u.port) : (u.protocol === "https:" ? 443 : 80);
    if (port === 2375 || port === 2376 || port === 9200 || port === 6379 || port === 5432 || port === 3306) return false;
    return true;
  } catch { return false; }
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  if (!isSafeUrl(url)) return null;
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 5000, validateStatus: () => true });
    if (res.status === 200) return Buffer.from(res.data);
  } catch {}
  return null;
}

export async function generateWelcomeCard(opts: {
  username: string;
  tag: string;
  guildName: string;
  memberCount: number;
  avatarUrl?: string | null;
  background?: string | null;
  textColor?: string | null;
}): Promise<Buffer | null> {
  try {
    const { createCanvas, loadImage, GlobalFonts } = await import("@napi-rs/canvas");

    const canvas = createCanvas(CARD_W, CARD_H);
    const ctx = canvas.getContext("2d");

    const bg = opts.background || "#1e1f2e";
    const textClr = opts.textColor || "#ffffff";

    if (bg.startsWith("http")) {
      const imgBuf = await fetchImageBuffer(bg);
      if (imgBuf) {
        const img = await loadImage(imgBuf);
        ctx.drawImage(img, 0, 0, CARD_W, CARD_H);
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, CARD_W, CARD_H);
      } else {
        ctx.fillStyle = "#1e1f2e";
        ctx.fillRect(0, 0, CARD_W, CARD_H);
      }
    } else {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, CARD_W, CARD_H);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(0, 0, CARD_W, CARD_H);
    }

    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, CARD_W - 2, CARD_H - 2);

    ctx.save();
    ctx.beginPath();
    const cx = AVATAR_X + AVATAR_SIZE / 2;
    const cy = AVATAR_Y + AVATAR_SIZE / 2;
    ctx.arc(cx, cy, AVATAR_SIZE / 2 + 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(88,101,242,0.8)";
    ctx.fill();
    ctx.restore();

    if (opts.avatarUrl) {
      const avBuf = await fetchImageBuffer(opts.avatarUrl);
      if (avBuf) {
        const avImg = await loadImage(avBuf);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, AVATAR_SIZE / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avImg, AVATAR_X, AVATAR_Y, AVATAR_SIZE, AVATAR_SIZE);
        ctx.restore();
      }
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#5865F2";
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = textClr;
      ctx.font = "bold 48px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(opts.username.slice(0, 1).toUpperCase(), cx, cy);
    }

    const textX = AVATAR_X + AVATAR_SIZE + 30;
    const midY = CARD_H / 2;

    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "22px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("BIENVENIDO/A A", textX, midY - 52);

    ctx.fillStyle = textClr;
    ctx.font = "bold 36px sans-serif";
    const gn = opts.guildName.length > 22 ? opts.guildName.slice(0, 22) + "…" : opts.guildName;
    ctx.fillText(gn, textX, midY - 14);

    ctx.fillStyle = textClr;
    ctx.font = "bold 28px sans-serif";
    const un = opts.username.length > 25 ? opts.username.slice(0, 25) + "…" : opts.username;
    ctx.fillText(un, textX, midY + 28);

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "18px sans-serif";
    ctx.fillText(`Miembro #${opts.memberCount}`, textX, midY + 62);

    ctx.fillStyle = "rgba(88,101,242,0.6)";
    ctx.fillRect(textX, midY + 78, 200, 2);

    return canvas.toBuffer("image/png");
  } catch (err) {
    return null;
  }
}
