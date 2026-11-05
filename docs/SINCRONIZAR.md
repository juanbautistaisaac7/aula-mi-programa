# Sincronizar Aula entre la compu y el celu

Aula guarda tus datos en cada dispositivo. Para que la compu y el celu tengan lo mismo, Aula usa una función chiquita en **Cloudflare Pages** (el mismo lugar donde ya está publicada la app, `aula-pi0.pages.dev`) y un **KV** (una base de datos clave-valor gratis de Cloudflare). No hay cuentas ni contraseñas: un **código de sincronización** al azar une tus dispositivos.

## 1. Una sola vez, en Cloudflare (2 minutos)

1. Entrá a **dash.cloudflare.com** → menú **Storage & Databases → KV** → **Create namespace**. Nombre: `aula-sync` → **Create**.
2. Andá a **Workers & Pages** → el proyecto de Aula → **Settings → Bindings** → **Add** → **KV namespace**.
   - **Variable name:** `AULA_KV` (exacto, en mayúsculas).
   - **KV namespace:** `aula-sync`.
   - **Save**. (Si te pregunta por entorno, que sea **Production**.)
3. **Deployments** → en el último deploy, **⋯ → Retry deployment** (o hacé cualquier push a `main`). Sin este paso la función no "ve" el KV.

Si Cloudflare muestra los menús con otros nombres (los cambian seguido): lo que importa es crear un KV y vincularlo al proyecto de Pages con el nombre `AULA_KV`.

## 2. En la compu

Aula → **Configuración → Sincronizar compu y celu → Activar en este dispositivo**. Arriba tiene que decir **"sincronizado"**. Si dice **"falta activar la sincronización"**, falta el paso 1 (o el redeploy).

## 3. En el celu

- **Si usás Aula en Safari:** escaneá el QR de la compu con la cámara → se abre Aula → **Conectar este dispositivo**.
- **Si usás Aula desde la pantalla de inicio (recomendado):** en iPhone la app instalada tiene sus datos separados de Safari, así que el link del QR abriría Safari y no la app. En ese caso tocá **Copiar código** en la compu (con el portapapeles universal de Apple lo tenés en el iPhone; si no, mandátelo por WhatsApp a vos mismo), abrí Aula en el celu → **Configuración → Ya tengo un código** → pegalo → **Conectar**.

La primera vez se **suman** los datos de los dos lados (no se borra nada) y antes se guarda una copia automática en **Copias de seguridad**.

## Qué hace sola

Sincroniza al abrir la app, al volver a ella, cuando vuelve la conexión, unos segundos después de cada cambio y cada minuto con la app abierta. Sin conexión todo se guarda igual y se sube después.

## Seguridad

Cualquiera con el código ve tus datos: no lo compartas. En Cloudflare se guarda bajo un hash del código (sin el código no se puede leer). Si el código se filtró: **Cambiar código** y volvé a conectar el otro dispositivo.

## Volver atrás

**Desconectar este dispositivo** deja tus datos donde están y corta la sincronización. Las copias automáticas siguen en **Copias de seguridad**.
