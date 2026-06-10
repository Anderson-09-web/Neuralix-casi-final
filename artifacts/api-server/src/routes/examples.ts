import { Router } from "express";
import type { Request } from "express";

const router = Router();

function getBaseUrl(req: Request): string {
  if (process.env.REPLIT_APP_URL) return process.env.REPLIT_APP_URL.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "tu-dominio.replit.app";
  return `https://${host}`;
}

/**
 * GET /api/examples
 * Returns Python code examples for all common API operations.
 * No authentication required.
 */
router.get("/examples", (req, res) => {
  const base = getBaseUrl(req);

  res.json({
    description: "Ejemplos de uso de la API de Neuralix en Python 3",
    base_url: base,
    authentication: {
      description: "Obtén tu token iniciando sesión con Discord y visitando GET /api/auth/token",
      methods: [
        "Authorization: Bearer <token>  →  cabecera HTTP",
        "X-API-Key: <token>             →  cabecera alternativa",
        "?token=<token>                 →  query param (facil para pruebas)",
        '{ "token": "..." }             →  campo en el body JSON (POST/PUT)',
      ],
      expiry: "30 dias. Renuevalo visitando GET /api/auth/token",
    },
    examples: {
      "1_obtener_token": {
        description: "Obtener tu JWT token para usar la API",
        note: "Primero inicia sesion con Discord en el dashboard, luego llama este endpoint",
        python: `import requests

BASE_URL = "${base}"

# Visita el dashboard y haz login con Discord primero.
# Luego obtén tu token:
resp = requests.get(f"{BASE_URL}/api/auth/token", cookies={"token": "TU_COOKIE_DE_SESION"})
data = resp.json()
TOKEN = data["token"]
print("Tu token:", TOKEN)
print("Ejemplo de uso:", data["usage"]["header"])
`,
      },

      "2_info_servidor": {
        description: "Obtener información de un servidor (guild)",
        python: `import requests

BASE_URL = "${base}"
TOKEN = "tu_jwt_token_aqui"
GUILD_ID = "tu_guild_id_aqui"

headers = {"Authorization": f"Bearer {TOKEN}"}

# Información básica del servidor
resp = requests.get(f"{BASE_URL}/api/guilds/{GUILD_ID}", headers=headers)
print(resp.json())
# {"id": "...", "name": "Mi Servidor", "memberCount": 250, "botPresent": true, ...}

# Estadísticas en tiempo real
resp = requests.get(f"{BASE_URL}/api/guilds/{GUILD_ID}/stats", headers=headers)
print(resp.json())
# {"memberCount": 250, "openTickets": 3, "antiraidDetections": 12, "backupsCount": 5, ...}

# Estado del bot
resp = requests.get(f"{BASE_URL}/api/guilds/{GUILD_ID}/bot-status", headers=headers)
print(resp.json())
# {"present": true, "addBotUrl": "https://discord.com/api/oauth2/authorize?..."}
`,
      },

      "3_configurar_bienvenidas": {
        description: "Configurar el sistema de bienvenidas con embed",
        variables: {
          "{user}": "Menciona al usuario (@NombreUsuario)",
          "{username}": "Solo el nombre de usuario",
          "{server}": "Nombre del servidor",
          "{membercount}": "Número de miembros",
          "{date}": "Fecha actual",
          "{tag}": "Usuario#discriminador",
        },
        python: `import requests

BASE_URL = "${base}"
TOKEN = "tu_jwt_token_aqui"
GUILD_ID = "tu_guild_id_aqui"

headers = {"Authorization": f"Bearer {TOKEN}"}

# Leer configuración actual
resp = requests.get(f"{BASE_URL}/api/guilds/{GUILD_ID}/welcome", headers=headers)
print("Config actual:", resp.json())

# Actualizar configuración de bienvenidas
resp = requests.put(
    f"{BASE_URL}/api/guilds/{GUILD_ID}/welcome",
    headers=headers,
    json={
        "enabled": True,
        "channelId": "123456789012345678",      # ID del canal de Discord
        "message": "Bienvenido {user} a **{server}**! Ya somos {membercount} miembros.",
        "embedEnabled": True,
        "embedTitle": "Bienvenido a {server}!",
        "embedDescription": "Hola {username}! Bienvenido al servidor.\\nFecha: {date}",
        "embedColor": "#5865F2",
        "embedFooter": "Neuralix Enterprise",
        "dmEnabled": True,
        "dmMessage": "Bienvenido a {server}! Lee las reglas del servidor.",
        "autoRoleIds": ["111222333444555666"]   # IDs de roles a asignar automaticamente
    }
)
print("Guardado:", resp.json())

# Ver preview del mensaje con variables reemplazadas
resp = requests.get(f"{BASE_URL}/api/guilds/{GUILD_ID}/welcome/preview", headers=headers)
print("Preview:", resp.json())
`,
      },

      "4_enviar_prueba_bienvenida": {
        description: "Enviar mensaje de prueba al canal de bienvenida",
        python: `import requests

BASE_URL = "${base}"
TOKEN = "tu_jwt_token_aqui"
GUILD_ID = "tu_guild_id_aqui"

headers = {"Authorization": f"Bearer {TOKEN}"}

# Enviar mensaje de prueba al canal configurado
resp = requests.post(
    f"{BASE_URL}/api/guilds/{GUILD_ID}/welcome/test",
    headers=headers
)
result = resp.json()

if result.get("ok"):
    print("Mensaje enviado correctamente al canal!")
else:
    print("Error:", result.get("error"))
    print("Pista:", result.get("hint"))
`,
      },

      "5_bot_member_join": {
        description: "Notificar al API cuando un miembro entra (llamado desde tu bot)",
        note: "Llama este endpoint desde tu bot de Discord cuando detectes el evento guildMemberAdd",
        python: `import requests

BASE_URL = "${base}"
TOKEN = "tu_jwt_token_aqui"
GUILD_ID = "tu_guild_id_aqui"

headers = {"Authorization": f"Bearer {TOKEN}"}

# Llamar cuando un nuevo miembro entra al servidor
# El API procesará el template y enviará el mensaje a Discord automáticamente
resp = requests.post(
    f"{BASE_URL}/api/bot/member-join/{GUILD_ID}",
    headers=headers,
    json={
        "userId": "987654321098765432",   # Discord ID del usuario que entró
        "username": "NuevoMiembro",        # Nombre de usuario
        "discriminator": "0",              # Discriminador (normalmente "0" en cuentas nuevas)
        "memberCount": 251                 # Nuevo total de miembros (opcional)
    }
)
result = resp.json()

if result.get("ok"):
    print(f"Bienvenida enviada al canal {result['channelId']}")
elif result.get("skipped"):
    print("Bienvenidas desactivadas:", result["reason"])
else:
    print("Error:", result.get("error"))
`,
      },

      "6_antiraid_config": {
        description: "Leer y actualizar configuración AntiRaid",
        python: `import requests

BASE_URL = "${base}"
TOKEN = "tu_jwt_token_aqui"
GUILD_ID = "tu_guild_id_aqui"

headers = {"Authorization": f"Bearer {TOKEN}"}

# Leer configuración completa de AntiRaid
resp = requests.get(f"{BASE_URL}/api/guilds/{GUILD_ID}/antiraid", headers=headers)
config = resp.json()
print("AntiRaid config:", config)

# Activar módulo anti-spam
resp = requests.post(
    f"{BASE_URL}/api/guilds/{GUILD_ID}/antiraid/toggle",
    headers=headers,
    json={
        "module": "antiSpam",
        "enabled": True
    }
)
print("Toggle result:", resp.json())
`,
      },

      "7_tickets": {
        description: "Gestionar tickets de soporte",
        python: `import requests

BASE_URL = "${base}"
TOKEN = "tu_jwt_token_aqui"
GUILD_ID = "tu_guild_id_aqui"

headers = {"Authorization": f"Bearer {TOKEN}"}

# Listar tickets abiertos
resp = requests.get(
    f"{BASE_URL}/api/guilds/{GUILD_ID}/tickets",
    headers=headers,
    params={"status": "open"}
)
tickets = resp.json()
print(f"Tickets abiertos: {len(tickets)}")

for ticket in tickets:
    print(f"  #{ticket['id']} - {ticket['subject']} ({ticket['createdAt']})")
`,
      },

      "8_query_param_auth": {
        description: "Usar token como query parameter (más fácil para pruebas rápidas)",
        python: `import requests

BASE_URL = "${base}"
TOKEN = "tu_jwt_token_aqui"
GUILD_ID = "tu_guild_id_aqui"

# Sin headers — token en query param
resp = requests.get(f"{BASE_URL}/api/guilds/{GUILD_ID}/stats?token={TOKEN}")
print(resp.json())

# POST con token en el body JSON
resp = requests.post(
    f"{BASE_URL}/api/guilds/{GUILD_ID}/welcome/test",
    json={"token": TOKEN}
)
print(resp.json())
`,
      },
    },
  });
});

export default router;
