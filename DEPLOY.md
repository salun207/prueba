# Deploy — Karting Zárate

Dos caminos. Elegí uno.

---

## A) Probarlo en tu compu (local) — 5 minutos

Necesitás **Python 3.11+** instalado.

```bash
# 1. Bajar el código
git clone https://github.com/salun207/prueba.git
cd prueba
git checkout claude/confident-hypatia-33loK

# 2. Entorno + dependencias
python -m venv .venv
source .venv/bin/activate        # en Windows:  .venv\Scripts\activate
pip install -r requirements.txt

# 3. Configuración (opcional: dejalo así para modo demo)
cp .env.example .env

# 4. Correr
uvicorn app.main:app --reload
```

Abrí http://localhost:8000 . Sin credenciales de WhatsApp, los avisos se
imprimen en la consola (modo demo). Todo lo demás funciona.

---

## B) Hostinger VPS (producción con HTTPS)

> Requiere un **VPS** de Hostinger (NO el hosting compartido) + un dominio.

### 1. Crear el VPS
- En Hostinger: **VPS** → plan más chico (KVM 1 alcanza) → sistema operativo
  **Ubuntu 24.04 con Docker** (Hostinger lo ofrece preinstalado).
- Anotá la **IP pública** del VPS.

### 2. Apuntar el dominio
- En tu dominio, creá un registro **A** apuntando a la IP del VPS.
  (Si comprás el dominio en Hostinger, lo hacés desde el mismo panel.)

### 3. Conectarte y desplegar
```bash
ssh root@TU_IP

git clone https://github.com/salun207/prueba.git
cd prueba
git checkout claude/confident-hypatia-33loK

cp .env.example .env
nano .env                 # completá las credenciales de WhatsApp (ver abajo)

nano Caddyfile            # cambiá "karting-zarate.com" por TU dominio real

docker compose up -d --build
```

Listo. Caddy saca el certificado HTTPS solo. Entrá a `https://tu-dominio`.

### Comandos útiles
```bash
docker compose logs -f app      # ver logs (y los mensajes de WhatsApp en demo)
docker compose restart app      # reiniciar tras cambios de .env
git pull && docker compose up -d --build   # actualizar a una versión nueva
```

---

## Activar WhatsApp real (cuando quieras salir del modo demo)

1. Entrá a https://developers.facebook.com → creá una app → agregá el
   producto **WhatsApp**.
2. Copiá al `.env`:
   - `WHATSAPP_TOKEN` (token de acceso)
   - `WHATSAPP_PHONE_NUMBER_ID` (ID del número de prueba o propio)
3. En el panel de Meta, configurá el **Webhook**:
   - URL: `https://TU-DOMINIO/webhook/whatsapp`
   - Verify token: el mismo valor de `WHATSAPP_VERIFY_TOKEN` del `.env`
4. `docker compose restart app`. Desde ahora los avisos salen por WhatsApp real.

---

## Conectar la disponibilidad real de SoloTurnos

Mientras `AVAILABILITY_SOURCE=mock`, la disponibilidad es simulada (para demo).
Para usar la real, ver la sección "Conectar la disponibilidad real" del README:
hay que descubrir los endpoints JSON con las DevTools del navegador e
implementar `_disponibilidad_soloturnos()` en `app/availability.py`.
