# Finanzas Backend

Backend para tracking automático de gastos desde SMS bancarios via iPhone Shortcuts.

## Flujo

```
SMS bancario llega al iPhone
        ↓
Shortcuts Automation (sin Apple Developer, sin app)
        ↓
POST /api/webhook/sms  →  Railway Backend
        ↓
Parsea + Categoriza + Guarda en PostgreSQL
        ↓
Sincroniza a Notion (opcional)
```

---

## Setup en producción (Railway)

### 1. Fork / clonar el repo

```bash
git clone https://github.com/giovannicg/finanzas-backend.git
cd finanzas-backend
```

### 2. Crear proyecto en Railway

1. Entra a [railway.app](https://railway.app) y crea una cuenta
2. **New Project → Deploy from GitHub repo** → selecciona `finanzas-backend`
3. En el servicio configurar:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npx prisma generate && npm run build`
   - **Start Command**: `npx prisma migrate deploy && node dist/index.js`

### 3. Agregar PostgreSQL

En el mismo proyecto de Railway:
- **New → Database → PostgreSQL**
- Railway conecta `DATABASE_URL` automáticamente al servicio

### 4. Variables de entorno en Railway

En el servicio del backend → **Variables**:

```
JWT_SECRET=         # genera uno con: openssl rand -hex 32
INBOX_DOMAIN=       # cualquier texto, ej: finanzas.app  (no necesitas dominio real)
PORT=               # 3000
NOTION_TOKEN=       # opcional, ver sección Notion
NOTION_DATABASE_ID= # opcional
```

### 5. Obtener tu URL

Railway genera una URL tipo:
```
https://finanzas-backend-production.up.railway.app
```

---

## Crear tu cuenta de usuario

```bash
curl -s -X POST https://TU-URL.up.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"tu@email.com","password":"tucontraseña"}' | jq .
```

Guarda el `token` que devuelve — lo necesitas para el Shortcut.

Para renovarlo cuando expire (30 días):
```bash
curl -s -X POST https://TU-URL.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"tu@email.com","password":"tucontraseña"}' | jq .token
```

---

## Configurar iPhone Shortcut

### Crear el Shortcut

1. Abre **Atajos** → **Automatización** → **+**
2. **Nueva automatización personal**
3. Trigger: **"El mensaje llega"**
   - De: [selecciona el contacto de tu banco]
   - Marca **"Ejecutar inmediatamente"** (sin confirmación)

### Acciones del Shortcut

```
① Acción: "Texto"
   Contenido: [Contenido del mensaje]  ← variable del trigger

② Acción: "Obtener contenido de URL"
   URL: https://TU-URL.up.railway.app/api/webhook/sms
   Método: POST
   Tipo de solicitud: JSON
   Cuerpo:
     token  →  "eyJhbGci...tu_token_jwt"
     text   →  [Texto del paso ①]
```

### Para tu novia

Ella repite el mismo proceso con su propia cuenta (registro + su propio Shortcut con su token).

---

## Sincronización con Notion (opcional)

### Crear la base de datos en Notion

Crea una página con una base de datos **Table** con estas propiedades:

| Propiedad | Tipo |
|---|---|
| Comercio | Title |
| Monto | Number → Peso mexicano |
| Categoría | Select |
| Tarjeta | Text |
| Fecha | Date |
| SMS | Text |

### Crear Integration

1. Ve a [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. **New Integration** → nombre: "Finanzas" → copia el token
3. En tu base de datos: `···` → **Connections** → agrega tu integration
4. Copia el ID de la base de datos (está en la URL: `notion.so/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx?v=...`)

### Agregar variables en Railway

```
NOTION_TOKEN=secret_xxxxxxxxxx
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Cada SMS que llegue aparecerá automáticamente en Notion.

---

## Probar manualmente

```bash
# Registrar usuario
curl -s -X POST https://TU-URL/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456"}'

# Simular SMS
curl -X POST https://TU-URL/api/webhook/sms \
  -H "Content-Type: application/json" \
  -d '{
    "token": "TU_JWT",
    "text": "Compra aprobada en UBER EATS por $234.50 con tarjeta terminacion 4521 el 17/03/2026"
  }'

# Ver transacciones
curl https://TU-URL/api/transactions \
  -H "Authorization: Bearer TU_JWT"

# Resumen del mes
curl https://TU-URL/api/transactions/summary \
  -H "Authorization: Bearer TU_JWT"
```

---

## API Reference

### Auth
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/register` | Crear cuenta |
| POST | `/api/auth/login` | Login → JWT |

### Transacciones
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/transactions` | Listar (filtros: category, from, to, page) |
| GET | `/api/transactions/summary` | Resumen por categoría del mes |
| POST | `/api/transactions` | Crear manualmente |
| DELETE | `/api/transactions/:id` | Eliminar |

### Alertas
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/alerts` | Listar con gasto actual |
| POST | `/api/alerts` | Crear límite por categoría |
| PATCH | `/api/alerts/:id` | Actualizar |
| DELETE | `/api/alerts/:id` | Eliminar |

### Categorías
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/categories` | Listar categorías custom |
| POST | `/api/categories` | Crear categoría |
| DELETE | `/api/categories/:id` | Eliminar |

### Webhooks
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/webhook/sms` | Desde iPhone Shortcuts |
| POST | `/api/webhook/email` | Desde SendGrid Inbound Parse |

---

## Stack

- Node.js + Express + TypeScript
- PostgreSQL + Prisma ORM
- JWT + bcrypt
- Expo Push Notifications (alertas de límite)
- Notion API (sync opcional)
