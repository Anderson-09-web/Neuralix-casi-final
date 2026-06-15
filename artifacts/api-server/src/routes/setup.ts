import { Router } from "express";
import { requireAuth } from "../lib/auth";

const router = Router();

function getAppDomain(): string | null {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (process.env.REPLIT_APP_URL) return process.env.REPLIT_APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const domains = process.env.REPLIT_DOMAINS?.split(",").map((d) => d.trim()).filter(Boolean);
  if (domains?.length) return domains[0];
  return null;
}

function buildLinks() {
  const domain = getAppDomain();
  const clientId = process.env.DISCORD_CLIENT_ID || "";
  const redirectUri = domain
    ? `https://${domain}/api/auth/discord/callback`
    : `http://localhost:8080/api/auth/discord/callback`;
  const oauthUrl = clientId
    ? `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20email%20guilds`
    : "";
  const botInvite = clientId
    ? `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`
    : "";
  return {
    domain: domain ? `https://${domain}` : "http://localhost:8080",
    redirectUri,
    oauthUrl,
    botInvite,
    clientIdConfigured: !!process.env.DISCORD_CLIENT_ID,
    clientSecretConfigured: !!process.env.DISCORD_CLIENT_SECRET,
    botTokenConfigured: !!process.env.DISCORD_BOT_TOKEN,
  };
}

// ─── JSON endpoint for admin panel ───────────────────────────────────────────
router.get("/admin/links", requireAuth, (req, res) => {
  const user = (req as any).user;
  if (!user?.isOwner) { res.status(403).json({ error: "Forbidden" }); return; }
  res.json(buildLinks());
});

router.get("/setup", (_req, res) => {
  const domain = getAppDomain();
  const redirectUri = domain
    ? `https://${domain}/api/auth/discord/callback`
    : `http://localhost:8080/api/auth/discord/callback`;

  const clientId = process.env.DISCORD_CLIENT_ID || "(no configurado)";

  const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20email%20guilds`;

  const botInvite = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Neuralix — Setup Info</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d0d14; color: #e2e8f0; font-family: system-ui, sans-serif; padding: 32px 16px; }
  h1 { font-size: 24px; font-weight: 900; margin-bottom: 8px; }
  p.sub { color: #94a3b8; font-size: 14px; margin-bottom: 32px; }
  .card { background: #161622; border: 1px solid #2d2d44; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
  .card h2 { font-size: 13px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 12px; }
  .url-box { background: #0d0d14; border: 1px solid #3b3b58; border-radius: 8px; padding: 12px 14px; font-family: monospace; font-size: 13px; color: #a78bfa; word-break: break-all; margin-bottom: 10px; user-select: all; cursor: text; }
  .btn { display: inline-block; background: #7c3aed; color: #fff; border: none; border-radius: 8px; padding: 9px 18px; font-size: 13px; font-weight: 700; cursor: pointer; transition: background .15s; }
  .btn:hover { background: #6d28d9; }
  .btn.copied { background: #16a34a; }
  .note { font-size: 12px; color: #64748b; margin-top: 8px; }
</style>
</head>
<body>
<h1>⚙️ Neuralix — Setup Info</h1>
<p class="sub">Copia las URLs desde aquí para Discord Developer Portal. Selecciona el texto azul y copia.</p>

<div class="card">
  <h2>1 · Redirect URI (OAuth2 → Redirects en Discord)</h2>
  <div class="url-box" id="redirect">${redirectUri}</div>
  <button class="btn" onclick="copy('redirect', this)">Copiar</button>
  <p class="note">Pega esto exactamente en Discord Developer Portal → OAuth2 → Redirects</p>
</div>

<div class="card">
  <h2>2 · OAuth2 URL completa (para iniciar sesión)</h2>
  <div class="url-box" id="oauth">${oauthUrl}</div>
  <button class="btn" onclick="copy('oauth', this)">Copiar</button>
  <p class="note">Esta es la URL que usa el botón "Iniciar sesión con Discord"</p>
</div>

<div class="card">
  <h2>3 · Invitar el bot al servidor</h2>
  <div class="url-box" id="bot">${botInvite}</div>
  <button class="btn" onclick="copy('bot', this)">Copiar</button>
  <p class="note">Usa esta URL para invitar tu bot a cualquier servidor</p>
</div>

<script>
function copy(id, btn) {
  const text = document.getElementById(id).innerText;
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerText;
    btn.innerText = '✓ Copiado';
    btn.classList.add('copied');
    setTimeout(() => { btn.innerText = orig; btn.classList.remove('copied'); }, 2000);
  });
}
</script>
</body>
</html>`);
});

export default router;
