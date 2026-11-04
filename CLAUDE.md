# Aula — instrucciones para el agente nocturno

Sos un agente que trabaja **solo, sin nadie mirando**, mejorando Aula: el organizador académico personal de Bauti (estudiante de Ingeniería en Sistemas, UTN FRRO, Rosario). Lo usa todos los días, sobre todo **desde el celular**. Bauti se levanta a las 10:00 (hora Argentina) y quiere encontrarse una app que parezca hecha por Apple: clara, simple, linda y que no frustre.

No hay nadie para responder preguntas. **No pidas confirmación nunca.** Tomá la decisión más razonable, anotala en la bitácora con el porqué y seguí.

## La app

- PWA en **JavaScript vanilla, sin dependencias ni build**: `index.html` (HTML + todo el CSS), `app.js` (toda la lógica), `sw.js` (service worker), `manifest.webmanifest`.
- Datos en **IndexedDB** (`aula-db`, store `kv`), un único objeto `state` (`state.tasks`, `state.evals`, `state.subjects`, `state.projects`, `state.sessions`, `state.settings`, `state.meta`, ...). `change()` guarda, `render()` redibuja según `location.hash` (`go(vista)`).
- `app.js` está dividido en secciones con encabezados `/* ===== NOMBRE ===== */`. Usá `grep -n "/\* =" app.js` para orientarte antes de leer. No leas el archivo entero de una.
- Podés reorganizar código si hace falta, pero mantené la app **sin build y sin dependencias de runtime** (se tiene que poder abrir el `index.html` tal cual).

## Reglas que no se rompen

1. **Los datos de Bauti son sagrados.** Tiene meses de datos reales en su celular. Cualquier cambio en la forma de `state` necesita una migración que convierta datos viejos sin perder nada, y un test que cargue un estado "viejo" y verifique que sobrevive. Nunca borres campos ni datos existentes: si algo deja de usarse (por ejemplo, los pomodoros), dejá de mostrarlo pero no borres lo guardado.
2. **Todo pasa por tests.** `npm test` tiene que dar verde antes de cada commit. Cada mejora agrega sus propios tests en `tests/` (Playwright; mirá `tests/helpers.js` y `tests/smoke.spec.js`). Probá en desktop **y** mobile (ya están los dos proyectos). Si un test viejo se rompe porque cambió la interfaz a propósito, actualizalo y explicalo en la bitácora; nunca lo borres ni lo saltees para que pase.
3. **Verificá visualmente.** Para cada cambio visible sacá screenshots con Playwright (desktop y mobile, tema claro y oscuro) y miralos con la herramienta Read antes de dar el ítem por terminado. Guardalos en `docs/capturas/<id-del-item>-*.png` y commitealos: Bauti los va a ver a la mañana.
4. **Cero errores de consola.** Los tests de humo ya lo chequean; mantenelo.
5. **Rama `agente/mejoras` solamente.** Nunca toques `main`, nunca hagas force-push.
6. **Al cambiar código de la app**, subí `APP_VERSION` en `app.js` (versión menor por ítem, por ejemplo 2.7.0, 2.8.0...) y `CACHE_VERSION` en `sw.js` con el mismo número. Si no, el celular de Bauti sigue mostrando la versión vieja.
7. **Sin secretos ni datos personales** en el repo.

## Cómo trabaja cada corrida

Cada corrida es una sesión nueva sin memoria de las anteriores. **La memoria son los archivos**: `BACKLOG.md` (qué falta), `docs/BITACORA.md` (qué pasó) y el historial de git.

1. **Preparar:**
   ```bash
   git clone https://github.com/juanbautistaisaac7/aula-mi-programa aula && cd aula
   git checkout agente/mejoras && npm install
   ```
2. **Candado:** si existe `.agente/LOCK` con una hora de hace menos de 65 minutos, otra corrida está trabajando. Anotá una línea en la bitácora ("corrida HH:MM: había otra en curso, salgo"), commiteá, pusheá y terminá. Si no hay candado o está vencido, escribí la hora actual (`date -Iseconds`) en `.agente/LOCK`, commiteá y pusheá **antes de empezar**.
3. **Leer** `docs/BITACORA.md` (por lo menos las últimas corridas) y `BACKLOG.md`.
4. **Elegir** el primer ítem `[ ]` del backlog cuyas dependencias estén hechas. Si quedó uno `[~]` (en curso) de una corrida que se cortó, retomalo desde lo que dejó.
5. **Trabajar el ítem** con este ciclo hasta cumplir **todos** sus criterios de "listo cuando":
   - Leer el código involucrado y entender el problema real.
   - Escribir los tests que prueban el criterio. Primero tienen que fallar.
   - Implementar.
   - Correr `npm test`. Si falla, entender por qué y arreglar. Repetir.
   - Screenshots y revisión visual con ojo crítico: ¿esto lo aprobaría un diseñador de Apple? Si no, mejorarlo.
   - Revisar el diff completo (`git diff`) buscando bugs, casos borde y código muerto.
6. **Cerrar el ítem:** marcarlo `[x]` en el backlog, escribir la entrada en la bitácora, commitear con un mensaje claro (`feat(series): ...`, `fix(tareas): ...`) y **pushear** (`git pull --rebase origin agente/mejoras` antes de `git push`).
7. **¿Seguir?** Mirá la hora. Si pasaron menos de **50 minutos** desde que arrancaste esta corrida, tomá el siguiente ítem (o seguí puliendo el actual). Si no, cerrá prolijo: cada hora arranca otra corrida que continúa donde dejaste. La idea es un loop constante de mejorar → testear → corregir, no una tarea suelta por hora.
8. **Si te trabás:** después de unos 3 intentos serios sin éxito, revertí lo que no anda (no dejes la app rota), marcá el ítem `[!]` con una nota corta de por qué, anotalo en la bitácora y seguí con otro. Si un ítem es demasiado grande para una corrida, partilo en sub-ítems en el backlog, hacé el primero y dejá el resto `[ ]`.
9. **Salir:** borrá `.agente/LOCK`, commiteá y pusheá. Nunca termines con tests en rojo en la rama.

**Si el backlog está vacío (o solo quedan `[!]`), no pares: hacé una pasada de calidad.** Usá la app como Bauti desde el celular (Playwright mobile): creá materias, parciales y tareas, armá una serie, mové tareas, completalas tarde a la noche, etc. Buscá bugs, fricciones, cosas feas o confusas, casos borde sin test. Anotá lo que encuentres como ítems nuevos y arreglalos. Repetí hasta que no encuentres nada que valga la pena; recién ahí cerrá.

Podés agregar ítems nuevos al backlog si encontrás algo necesario (bugs, mejoras de UX, deuda técnica que frena). Ponelos en la sección "Agregados por el agente" con su porqué. No te desvíes a cosas cosméticas menores mientras queden pendientes ítems importantes.

## Bitácora (`docs/BITACORA.md`)

Bauti la va a leer a la mañana para entender qué pasó y para aprender cómo trabaja un agente. Escribila en **español rioplatense, claro y honesto**, sin vender humo. Por corrida:

```markdown
## Corrida HH:MM–HH:MM (hora ARG) — <ítem(s)>

**Plan:** qué ibas a hacer y cómo lo pensaste.
**Decisiones:** cada decisión importante y por qué (qué alternativas descartaste).
**Salió bien:** ...
**Salió mal / intentos fallidos:** qué probaste que no anduvo y qué aprendiste. Si no hubo, decilo.
**Tests:** cuántos agregaste, resultado final de `npm test` (X pasaron / Y fallaron).
**Capturas:** links relativos a `docs/capturas/...`
**Commits:** hashes cortos + mensaje.
**Para Bauti:** dudas, cosas que conviene que pruebe en el celu, decisiones que quizás quiera cambiar.
```

Usá horas reales (`TZ=America/Argentina/Buenos_Aires date +%H:%M`). Las entradas nuevas van **arriba** del todo, debajo del encabezado.

## Última corrida de la noche

Si al arrancar ya son las **09:00 o más** (hora ARG), además de lo normal, escribí `docs/RESUMEN-NOCHE.md`, que es lo primero que Bauti va a abrir:
- Qué quedó hecho, en una lista corta y concreta.
- Qué quedó a medias o bloqueado, y por qué.
- Cómo probarlo: qué tocar en la app, en qué orden, y qué mirar especialmente en el celular.
- Cómo pasar los cambios a la app real: revisar la rama y mergear `agente/mejoras` en `main`.
- Estadísticas de la noche: corridas, commits y tests al principio vs al final.
- Las 3 capturas más representativas.

## Estándar de diseño

Bauti tiene un ojo exigente y quiere nivel Apple. Concretamente:
- **Mobile first.** Áreas táctiles de 44 px o más, nada de hover como única forma de acceder a algo, gestos naturales (arrastrar, deslizar).
- **Simplicidad.** Menos opciones visibles a la vez; lo avanzado, escondido pero a mano. Cada pantalla tiene una tarea principal obvia.
- **Siempre se entiende qué está pasando:** vista previa antes de aplicar cambios masivos ("vas a mover 5 tareas: ..."), y deshacer después de cada acción destructiva o masiva.
- **Tipografía y espaciado** consistentes, jerarquía clara, respetar tema claro y oscuro (ya existen variables CSS en `:root[data-theme=...]`; usalas y extendelas).
- **Animaciones sutiles** (150–250 ms) y respetar `prefers-reduced-motion`.
- **Textos** en español rioplatense, cortos y humanos.
