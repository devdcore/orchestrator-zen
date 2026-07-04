# Revisión crítica de Orbit Harness

> Revisión hecha sobre el código y docs actuales + verificación empírica del CLI de OpenSpec
> (`npx @fission-ai/openspec@latest`) y de los docs oficiales de Claude Code (memory). Fecha: 2026-06-13.

## Veredicto en una línea

El núcleo defendible de Orbit es real y bien pensado: **aislamiento por subagentes** (ahorro de tokens + review de contexto fresco), **dos human gates** y **trazabilidad portable y commiteada** (roadmap/decisions + specs de OpenSpec). Alrededor de ese núcleo hay wrappers finos, solapamientos de roles, y **dos bugs que rompen el flujo hoy** (perfil de OpenSpec y `CLAUDE.md`). No está en el punto "mínimo" que pides: Orbit + OpenSpec son dos sistemas completos superpuestos. Vale la pena si de verdad necesitas portabilidad multi-agente; si solo usas Claude Code, gran parte es reemplazable por built-ins.

---

## Bugs confirmados (arréglalos primero)

### B1 — El perfil expandido de OpenSpec nunca se activa → `/opsx:verify` no se instala (tu pregunta #8)

Verificado ejecutando el CLI real:

```
openspec update [options]
Options:
  --force   Force update even when tools are up to date
```

`openspec update` **no tiene** `--profile`. La línea de `src/commands/init.js`:

```js
await run(root, "npx", ["openspec", "update", "--profile", "custom"]);
```

falla siempre (opción desconocida) y cae al fallback `openspec update` plano, que deja el **perfil por defecto** (solo `propose`, `explore`, `apply`, `archive`). Por eso `/opsx:verify`, `/opsx:new`, `/opsx:ff`, `/opsx:continue`, `/opsx:sync`, `/opsx:bulk-archive` **no aparecen** al instalar en una carpeta nueva. Tu observación es correcta y este es el motivo.

**Fix.** El perfil se cambia con:

```
openspec config profile [preset]   # acepta preset no interactivo (shortcut)
openspec update --force
```

Falta confirmar el nombre exacto del preset (el `--help` abre picker interactivo; el blog lo llama "expanded"). Hazlo con `config profile <preset>` y luego `update --force`.

**Gotcha grave de portabilidad:** `openspec config` es **scope global** ("only 'global' supported currently"). El perfil de workflow es un ajuste **de máquina, no del proyecto** y no se commitea. Consecuencia: un compañero, una CI o tú en otra máquina haréis `orbit init` y os volverá a faltar `/opsx:verify`. Esto choca de frente con la promesa "portable y project-local" de Orbit. Dos opciones:
1. No depender de comandos solo-expandidos en el flujo (usar `/opsx:propose`+`/opsx:apply`+`/opsx:archive` del perfil default, y hacer la verificación con `orbit-qa-verifier` + `openspec validate`).
2. Documentar explícitamente que el perfil expandido es un requisito global de máquina y que `orbit doctor` debe avisar si no está.

### B2 — `orbit init` no crea `CLAUDE.md` (tu punto #6.1)

Confirmado en docs oficiales: **Claude Code lee `CLAUDE.md`, no `AGENTS.md`.** Hoy `init.js` solo escribe `AGENTS.md`, así que en Claude Code el arranque de Orbit no se carga.

**Fix limpio (mejor que un hook de sincronización):** que `orbit init` escriba un `CLAUDE.md` de una línea que importe el AGENTS.md:

```markdown
@AGENTS.md
```

El `@path` import está soportado y se expande al inicio de sesión. Así hay **una sola fuente de verdad** (`AGENTS.md`) y `CLAUDE.md` queda siempre sincronizado por construcción — no necesitas un hook que copie cambios de uno a otro. Si algún día quieres reglas solo-Claude, las añades debajo del import. (Alternativa en Unix: symlink `ln -s AGENTS.md CLAUDE.md`, pero el import es más robusto y cross-OS.)
`orbit doctor` debería además verificar la presencia de `CLAUDE.md`.

### B3 — La inyección TDD en `openspec/config.yaml` puede romper el YAML

`injectOpenSpecConfig` (init.js) hace **append** de un bloque que vuelve a declarar `context:` y `rules:`. Si OpenSpec ya generó un `config.yaml` con esas claves, terminas con **claves duplicadas** → YAML inválido o el segundo bloque ignorado silenciosamente. El guard `includes("red-green-refactor")` evita la doble ejecución de Orbit, pero no el choque con las claves que OpenSpec escribe por su cuenta. Hay que **mergear** (parsear y combinar `context`/`rules`), no concatenar texto.

### B4 — Jerga sin definir en `orbit-reviewer`

En `templates.js`, la instrucción de `orbit-reviewer` dice: *"In modo juicio, perform two independent review passes"*. "modo juicio" está a medio traducir y **no está definido en ningún sitio** — el agente no puede interpretarlo. Defínelo (¿segunda pasada independiente cuando el riesgo es alto?) o elimínalo. Igual en `skills.js` (`useWhen: "...or juicio"`).

---

## Respuestas a tus preguntas, una por una

### 1. Calidad del requerimiento (orbit-pm-spec / orbit-scout) + ¿la skill `to-prd`?

**Diagnóstico:** tienes **tres** mecanismos que solapan la clarificación de un requerimiento vago, y esa es la raíz de tu confusión: `orbit-pm-spec` (producto), `orbit-scout` (código) y `/opsx:explore` (enfoque). Hoy sus instrucciones son de 4 líneas y no separan bien quién hace qué.

**División que recomiendo (sirve también al minimalismo):**
- `orbit-pm-spec` = **el QUÉ y el PORQUÉ**: user story, criterios de aceptación, goals/non-goals, scope, riesgos. Independiente de implementación.
- `orbit-scout` = **el DÓNDE**: archivos, convenciones, código reutilizable, riesgos técnicos del repo. Sin editar.
- `/opsx:explore` = **el CÓMO (opciones)**: comparar enfoques técnicos cuando hay varios caminos.

No corras los tres siempre. pm-spec si el pedido de producto es vago; scout si el área de código es desconocida; explore si el enfoque técnico es incierto.

**Sobre las dos skills que enviaste (leídas verbatim):**

- **`write-spec` (Anthropic) → SÍ, adóptala para `orbit-pm-spec`.** Es autocontenida, produce **markdown local** (no depende de herramientas externas; los connectors son opcionales), y es exactamente lo que te falta: Problem Statement, Goals, **Non-Goals con justificación**, User Stories en formato estándar con "por qué", Requirements con **P0 "be ruthless"** (MoSCoW), Success Metrics (leading/lagging), Open Questions, y **criterios de aceptación en Given/When/Then cubriendo happy path + edge + casos negativos**. Eso eleva directamente tu prioridad #1. Como corre como subagente bajo demanda, su tamaño (~200 líneas) no es coste de arranque.
- **`to-prd` (mattpocock) → NO la copies.** Depende de un **issue tracker externo**, de `/setup-matt-pocock-skills`, de un glosario de dominio y de ADRs, y **publica fuera**. Viola tu minimalismo, tu local-first y tu portabilidad. Lo único que vale la pena robar es su idea de **"seams" de testing** (decidir los puntos de prueba antes de escribir), que puedes mencionar dentro de pm-spec o del builder. Pero la skill como tal no encaja.

### 2. ¿`/opsx:explore` debería ser obligatorio? + ¿la skill `write-spec`?

**No, no debe ser obligatorio.** Forzar `explore` siempre quema tokens y contradice tus objetivos #3/#4. Debe ser **condicional**: cuando el enfoque técnico es genuinamente incierto o el área es desconocida.

Y aclaro tu duda de fondo: **`explore` no sirve para mejorar requisitos vagos** — eso es trabajo de `orbit-pm-spec` (el QUÉ). `explore` aclara **el CÓMO** una vez el QUÉ está claro. Orden correcto: `pm-spec` (si vago) → `explore` (si el cómo es incierto) → `propose`. Deja esto explícito en las instrucciones del orquestador, que hoy no lo distinguen.

`write-spec` es para la pregunta #1, no para esta. Para "mejorar requisitos" tu herramienta es pm-spec + write-spec, no explore.

### 3. Calidad en crear los artefactos

Los artefactos (proposal/specs/design/tasks) son territorio de OpenSpec y está bien delegado. El **lever correcto** es la inyección TDD en `config.yaml` (ver **B3** — ahora mismo con riesgo de romper el YAML). Una vez arreglado el merge, los artefactos ya nacen con sub-tarea de test y sección de testing strategy. No dupliques esa lógica en Orbit.

### 4. Calidad de la implementación / TDD + ¿la skill `tdd` de mattpocock?

**La skill `tdd` de mattpocock está muy bien diseñada y SÍ deberías incorporarla** (leída verbatim, no el resumen). Lo que añade sobre tu `orbit-builder` actual:
- **"Test behavior through public interfaces, not implementation details"** — el principio que más te falta; evita tests acoplados que se rompen al refactorizar.
- **Anti-patrón explícito: NO "horizontal slicing"** (no escribas todos los tests y luego todo el código). En su lugar **tracer bullets**: un test → mínimo código → repetir. Tu inyección actual (`T.0 Write failing test for <behavior>` por tarea) empuja un poco hacia lo horizontal; este matiz lo corrige.
- **"Never refactor while RED."**
- Checklist por ciclo.

**¿Copiarla tal cual?** Casi. **Cuidado:** referencia archivos compañeros que no existirán (`tests.md`, `mocking.md`, `deep-modules.md`, `interface-design.md`, `refactoring.md`). El cuerpo principal se sostiene solo: **copia el cuerpo y quita/inline esas referencias entre corchetes**. Recomendación concreta: funde sus principios en `orbit-builder` (o crea un `orbit-tdd` que el builder cargue), y mantén la inyección en `config.yaml` para que los artefactos lo reflejen. Eso refuerza tu harness sin romper portabilidad.

### Revisión de cambios (orbit-qa-verifier / orbit-reviewer) + ¿solapa con `/opsx:verify`? + skills de simplify/architecture

**Solapamiento de tres verificadores — sepáralos o reduce a dos:**
- `/opsx:verify` (OpenSpec) = ¿el código coincide con los **specs delta** (completeness/correctness/coherence)? Es verificación **contra el artefacto**.
- `orbit-qa-verifier` = ¿se cumplen los **criterios de aceptación** de pm-spec, con evidencia de tests ejecutados? Va **más allá del artefacto**.
- `orbit-reviewer` = **caza de bugs/regresiones/scope drift con contexto fresco** = tu objetivo #2 ("que no genere otros problemas"). Es el más valioso y el que debes reforzar.

Tres pasos es uno de más para un harness "mínimo". Opción razonable: **fusionar qa-verifier dentro de reviewer** (un solo subagente de contexto fresco que (a) corre tests y comprueba criterios de aceptación y (b) busca regresiones), dejando `/opsx:verify` como el check de specs de OpenSpec. Si los mantienes separados, afila la frontera en sus instrucciones para que no repitan trabajo. (Nota del FLOW_MAPPING: ya tenías esto marcado como "open question" — esta es la resolución.)

**Sobre las dos skills que enviaste:**

- **`code-simplifier` (Anthropic) → NO la adoptes verbatim.** Está acoplada a convenciones JS/TS concretas (ES modules, `function` declarations, return type annotations) → no es portable, que es justo el core de Orbit. Además su mandato ("simplifica el código recién tocado") **roza con tu regla de "Surgical Changes / toca solo lo que la tarea pide"** del AGENTS.md → puede generar fricción. El principio (simplificar lo recién cambiado preservando comportamiento) es bueno pero ya lo cubre el built-in `/simplify` de Claude para quien use Claude. Baja prioridad.
- **`improve-codebase-architecture` (mattpocock) → potente pero NO para el loop de Orbit.** Genera **reportes HTML con Tailwind + Mermaid**, depende de `CONTEXT.md`, `LANGUAGE.md`, ADRs y un "grilling loop" interactivo. Es pesada y **viola tu prioridad de tokens mínimos**. Su vocabulario ("deep modules", "deletion test", "seams") es excelente, pero es una **actividad arquitectónica ocasional e independiente**, no algo que metas en cada change. Tenla como herramienta aparte si algún día quieres una auditoría de arquitectura; no la integres al harness.

> Nota: para tus objetivos de revisión (#1 acorde a requerimiento, #2 sin nuevos bugs), si trabajas en Claude Code tienes **`/code-review` y `/security-review`** ya disponibles, que hacen review de diff riguroso. `orbit-reviewer` solapa con `/code-review`. Decide si quieres tu propio reviewer portable o apoyarte en el built-in cuando estés en Claude.

### 6.1 CLAUDE.md / sincronización con AGENTS.md

Resuelto en **B2**: `orbit init` debe escribir `CLAUDE.md` con `@AGENTS.md`. Eso sincroniza ambos **sin hook** (una sola fuente de verdad). No hace falta "si uno cambia el otro cambia": con el import solo existe uno real.

### 6.2 / 6.3 Harness mínimo y eficiente / contexto de arranque barato

El diseño de arranque está **bien pensado**: `AGENTS.md` + `orbit.config.yaml` + `skills/index.md` (metadata only) + `roadmap.md` (índice + perfil estable), y `decisions.md`/`handoff.md` solo bajo demanda. Esa estratificación es correcta y barata.

Pero **honestamente no estás en "lo mínimo posible"**: tienes 7 roles + skill de flujo + 5 skills de stack + AGENTS.md + toda la instrumentación de OpenSpec (que añade **su propio** AGENTS.md/instrucciones y comandos). Hay redundancia entre `orbit-openspec-sdd-flow`, el FLOW_MAPPING y lo que OpenSpec ya documenta. Candidatos a recortar:
- `orbit-openspec-sdd-flow` (duplica lo que OpenSpec instala y el FLOW_MAPPING).
- Las 5 `stack-*` skills se instalan **siempre**, coincidan o no con el stack real → ruido en el índice. Instala solo las del stack detectado, o conviértelas en ejemplos opcionales.

### 6.4 ¿OpenSpec ayuda o perjudica el ahorro de tokens?

**Respuesta honesta: mixto.**
- **A favor:** los artefactos (proposal/specs/design/tasks) viven en disco y se leen **bajo demanda**; no inflan el arranque. Dan trazabilidad real.
- **En contra:** `openspec init` escribe **sus propias instrucciones de agente** (AGENTS.md/skills) y cada comando `/opsx:` inyecta su texto. Es bastante más que "el mínimo". Si tu prioridad absoluta fuera tokens, OpenSpec es overhead.

Conclusión: OpenSpec **no es la opción más barata en tokens**, pero compra **estructura y trazabilidad**. Es un trade-off legítimo *si valoras la trazabilidad por specs*. Si lo que quieres es lo más liviano posible, OpenSpec es demasiado y podrías quedarte con roadmap/decisions + tasks ligeras. No puedes maximizar trazabilidad-por-specs **y** tokens-mínimos a la vez; elige.

### 6.6 Sintaxis dos-puntos vs guión (Claude vs Cursor/Windsurf/OpenCode)

Punto **válido y hoy mal cubierto**. Confirmado: en Claude es `/opsx:verify`, en Cursor/Windsurf/OpenCode/Codex es `/opsx-verify`. Tu `skillIndexRecord`/`invocationHint` resuelve bien las skills **de Orbit** (`/id`, `$id`, `@id`), pero los **comandos `/opsx:` están hardcodeados con dos puntos** en las instrucciones del orquestador, en `orbit-openspec-sdd-flow` y en todos los docs. En un agente no-Claude eso es literalmente incorrecto. Arréglalo: o haces las instrucciones *tool-aware*, o pones una nota única "sustituye `:` por `-` fuera de Claude Code" bien visible que el orquestador inyecte según la tool.

### 6.7 ¿Hooks?

**Valor real, pero solo-Claude → fragmenta tu portabilidad** (los hooks viven en `settings.json` de Claude Code). Dos usos tentadores:
- Sincronizar CLAUDE.md↔AGENTS.md → **innecesario**, el `@import` ya lo resuelve.
- Forzar TDD (bloquear cerrar tarea sin tests vía PreToolUse) → potente, pero solo aplica en Claude y duplica lo que ya hace la config de OpenSpec + el builder.

**Veredicto:** no metas hooks en el core. Ofrécelos como **extra opcional solo-Claude** (p.ej. un PreToolUse que corra la suite antes de permitir marcar `tasks.md`), documentado como no-portable. El harness no debe depender de ellos.

### 6.8 verify ausente

Resuelto en **B1**.

### 9. ¿Roadmap y Decisions son buena idea?

**Sí — es de lo mejor del diseño.** `roadmap.md` (índice barato siempre cargado: perfil estable + estado de módulos + punteros Now/Next) y `decisions.md` (log de *por qué*, bajo demanda) es exactamente el split correcto coste/valor, y portable/commiteado (mejor para trazabilidad que la auto-memory de Claude, que es local de máquina). Mantenlo. Única cautela: el **estado** de los módulos también lo sabe OpenSpec (`openspec list`), así que el roadmap debe quedarse como **índice legible por humanos**, no como fuente de verdad duplicada del detalle de specs — cosa que ya dejas clara en las plantillas. Bien.

### 10. Modelo por agente

**Hay una desalineación que contradice tu prioridad #1.** Hoy: `pm-spec` y `scout` = `fast`→haiku (el modelo más débil); el resto = `inherit`. Pero **`orbit-pm-spec` hace el trabajo de calidad-de-requerimiento que marcaste como la prioridad #1** y corre en el modelo más flojo.

Recomendación: **alinea la fuerza del modelo con dónde importa la calidad**, no la repartas plana.
- `orbit-pm-spec` → **strong/inherit** (entender bien el requerimiento es crítico).
- `orbit-reviewer` y `orbit-qa-verifier` → **strong** (rigor en la caza de bugs).
- `orbit-builder` → inherit/strong.
- `orbit-scout` → `fast` está bien (recon mecánico).

### 11. ¿Dejar la memoria a mano de los agentes?

Hoy la memoria **no** está libremente en manos de los agentes: son ficheros markdown explícitos (`roadmap`/`decisions`/`handoff`) que escribe el orquestador en momentos definidos. Eso es **lo correcto para tu objetivo de trazabilidad**: portable, commiteado, revisable, gateado. Dejar que cada subagente escriba memoria libremente arriesga drift e incoherencia.

Matiz: en Claude existe la **auto-memory** (`~/.claude/projects/<project>/memory/MEMORY.md`) que se escribe sola. Es cómoda pero **local de máquina, no portable y opaca** → no la conviertas en fuente de verdad del proyecto. Que complemente en Claude si quieres, pero la trazabilidad vive en tus ficheros explícitos. **Mantén el modelo actual.**

---

## Meta: ¿construir Orbit o usar plugins existentes?

Me pediste honestidad aquí. El **valor único y defendible** de Orbit es:
1. **Aislamiento por subagentes** (ahorro de tokens + review de contexto fresco) — real.
2. **Dos human gates** (antes de apply, antes de archive) — OpenSpec no los tiene.
3. **Trazabilidad portable y commiteada across agentes** (roadmap/decisions + specs).

Si tu uso real es **multi-agente** (codex + claude + cursor + opencode), Orbit se justifica: nadie más te da ese contrato común portable.

Si en la práctica **solo usas Claude Code**, buena parte es reemplazable por built-ins que ya tienes: subagentes nativos (`.claude/agents`), **`/code-review` + `/security-review`** (review/seguridad), **`/simplify`** (limpieza), CLAUDE.md + auto-memory (contexto), **`/loop`** (iteración), `/init`. En ese escenario, una pila más delgada — **CLAUDE.md fino + OpenSpec para specs + los built-ins de review** — te da casi lo mismo con mucho menos que mantener. (Nota: `/goal` y `/workflow` que mencionas **no están** entre los skills disponibles en este entorno; no puedo evaluarlos, no asumas que existen aquí.)

**Mi recomendación:** no abandones Orbit, pero **adelgázalo hacia su núcleo defendible** y deja de competir con built-ins en lo que ya hacen bien. Conserva: subagentes aislados, gates, roadmap/decisions, TDD reforzada (skill de mattpocock), pm-spec reforzado (write-spec). Recorta/condiciona: `orbit-openspec-sdd-flow`, las stack-skills always-on, el solape de tres verificadores, y la dependencia de comandos solo-expandidos de OpenSpec (que además son global-scope).

---

## ¿El orquestador como skill y no como agente está bien?

**Sí, es correcto por diseño, no un descuido.** Los subagentes **no pueden lanzar subagentes**; el orquestador debe quedarse en el **hilo principal** para poder (a) delegar a los subagentes y consumir solo sus resúmenes, y (b) sostener los human gates y preguntarte a ti. Si lo hicieras subagente, perdería ambas capacidades. En Claude, además, no hay un "fichero de agente principal": la forma natural de implementar el orquestador **es** una skill que gobierna el hilo. Así que está bien. (Lo que sí puedes mejorar es el *contenido* de esa skill: la persona de "mejor arquitecto del mundo" hoy es genérica; refuérzala con criterios de clasificación más afilados y con la división pm-spec/scout/explore de arriba.)

---

## Cómo funciona OpenSpec (resumen que pediste)

OpenSpec es un sistema de **Spec-Driven Development AI-native**. Flujo y piezas:

- **`openspec init`**: instala la estructura `openspec/specs/` (specs vigentes), `openspec/changes/` (cambios en curso), `openspec/changes/archive/`, `openspec/config.yaml` y los **skills/slash-commands por agente** en `.claude/skills/`, `.cursor/skills/`, etc.
- **Specs vs changes**: `specs/` es el estado actual del sistema; cada **change** en `changes/<name>/` es una propuesta con `proposal.md`, `specs/` (deltas ADDED/MODIFIED/REMOVED en Given/When/Then), `design.md` y `tasks.md` (checklist). Implementas contra el change; al cerrar, los deltas se **mergean** a `specs/` y el change se **archiva**. Eso te da historia y trazabilidad.
- **Comandos slash** (`/opsx:` en Claude, `/opsx-` en otros agentes):
  - Perfil **default**: `/opsx:propose` (crea change + todos los artefactos), `/opsx:explore` (exploración sin artefactos), `/opsx:apply` (implementa tasks), `/opsx:archive` (archiva + mergea specs).
  - Perfil **expandido** (hay que activarlo con `openspec config profile`, **global**): `/opsx:new`, `/opsx:continue`, `/opsx:ff`, `/opsx:verify`, `/opsx:sync`, `/opsx:bulk-archive`, `/opsx:onboard`.
- **CLI** (complementa a los slash): `openspec list`, `view`, `validate`, `archive`, `status`, `instructions`, `update` (refresca instrucciones/commands), `config` (ajustes globales, incl. `profile`).
- **Qué aporta a Orbit**: el motor de specs/artefactos/implementación/archivado. Orbit pone encima: clasificación, pm-spec, los dos gates, TDD, QA por criterios de aceptación, review de contexto fresco, y el roadmap/decisions.

---

## Resumen de acciones priorizadas

1. **B1** – Activar perfil expandido con `openspec config profile <preset>` + `openspec update --force`; avisar en `doctor`; decidir si depender de comandos expandidos dado que el perfil es global de máquina.
2. **B2** – `orbit init` escribe `CLAUDE.md` = `@AGENTS.md`; `doctor` lo verifica.
3. **B3** – Mergear (no append) la config TDD en `openspec/config.yaml`.
4. **B4** – Definir o eliminar "modo juicio" en `orbit-reviewer`.
5. **#10** – Subir el tier de modelo de `pm-spec`, `reviewer`, `qa-verifier`.
6. **#1/#4** – Reforzar `orbit-pm-spec` con el cuerpo de `write-spec`; reforzar `orbit-builder`/nuevo `orbit-tdd` con el cuerpo de la skill `tdd` de mattpocock (quitando refs a archivos compañeros).
7. **#1/#2** – Separar pm-spec (qué) / scout (dónde) / explore (cómo, condicional) en las instrucciones del orquestador.
8. **Verificadores** – Fusionar `qa-verifier` en `reviewer` o afilar la frontera con `/opsx:verify`.
9. **#6.6** – Nota o lógica tool-aware para `:` vs `-` en los comandos `/opsx`.
10. **Adelgazar** – Revisar `orbit-openspec-sdd-flow` y las `stack-*` always-on.
11. **Descartar** – `to-prd`, `code-simplifier`, `improve-codebase-architecture` como skills integradas (no encajan con minimalismo/portabilidad).

---

## Cambios aplicados (changelog de decisiones)

### 2026-06-13 — Primera ronda de fixes y refuerzos

**B1 — Perfil OpenSpec / `/opsx:verify`.** Decisión: **Opción A (quitar la dependencia)**. Verificado ejecutando el CLI real que (a) `openspec update` no tiene `--profile`, (b) el único preset de `config profile` es `core`, (c) `config set` no parsea arrays, (d) la selección de workflows es **global de máquina** (`profiles.js`: `custom` solo activa la lista `workflows`, que por defecto no incluye `verify`). Por tanto no hay vía no-interactiva portable. Acción: eliminado `enableExpandedProfile` de `init.js` (corría el inválido `update --profile custom`); el flujo usa solo el perfil default (`propose/explore/apply/sync/archive`) + `npx openspec validate`; la verificación de artefactos/criterios la posee `orbit-qa-verifier`. `orbit.config.yaml` → `profile: default`.

**B2 — `CLAUDE.md`.** `orbit init` ahora escribe `CLAUDE.md` con `@AGENTS.md` (Claude Code lee `CLAUDE.md`, no `AGENTS.md`; el import mantiene una sola fuente de verdad). `doctor` lo verifica. Test añadido.

**B3 — Inyección TDD en `openspec/config.yaml`.** `injectOpenSpecConfig` ahora detecta claves `context:`/`rules:` activas y, si existen, no hace append (evita YAML con claves duplicadas) y avisa. (Severidad real: latente — en instalación fresca esas claves vienen comentadas, así que no rompía.)

**B4 — "modo juicio".** Reemplazada la jerga sin definir en `orbit-reviewer` por "two independent passes for high-risk or security-sensitive changes".

**#10 — Modelos.** `orbit-pm-spec` subido de `fast` (haiku) a `inherit` — entender el requerimiento es prioridad #1. `scout` se mantiene `fast`. `qa`/`reviewer`/`builder` en `inherit` (el alto riesgo se cubre con el escalado fan-out, no forzando opus siempre).

**#1/#4 — Refuerzo de roles.** `orbit-pm-spec` reescrito con la estructura de `write-spec` (Problem/Goals/Non-Goals/User Stories/Requirements P0-P1-P2 ruthless/Acceptance Criteria Given-When-Then con casos negativos/Open Questions/Risks). `orbit-builder` reforzado con principios de la skill `tdd` de mattpocock (tracer bullets / no horizontal slicing, comportamiento vs implementación, never refactor while RED).

**#1/#2 — Separación de roles de clarificación.** Añadida sección "Clarification Roles — What vs Where vs How" al orquestador: `pm-spec`=QUÉ, `scout`=DÓNDE, `explore`=CÓMO (condicional, no obligatorio, después del QUÉ).

**Verificadores.** Decisión: **mantener `qa-verifier` y `reviewer` separados** (mentalidad constructiva vs adversaria). Reforzados ambos. `reviewer` ahora incluye **scoring de confianza ≥80 + lista de falsos positivos** (tomados del `/code-review` oficial de Claude) y **escalado fan-out condicional** para alto riesgo (lo lanza el orquestador, 2-3 lentes en paralelo).

**#6.6 — Sintaxis `:` vs `-`.** Nota añadida en AGENTS.md y en el skill de flujo: Claude usa `/opsx:`, los demás `/opsx-`.

### 2026-06-14 — Segunda ronda: adelgazamiento

**Quitado `orbit-openspec-sdd-flow`.** Era un puente redundante: su tabla de comandos, la sintaxis
`:`/`-`, el esquema de artefactos y los gates ya viven en `AGENTS.md` y en el cuerpo de
`sdd-orchestrator`, y OpenSpec instala sus propios skills `opsx:*`. Antes de borrarlo verifiqué que
la referencia `/opsx:` realmente esté en `AGENTS.md` (el fichero que el orquestador carga vía
`CLAUDE.md → @AGENTS.md`), no solo en docs que el orquestador no auto-carga. Lo agregué a
`LEGACY_SKILL_IDS` para que `orbit init` lo limpie de instalaciones viejas. −1 skill × 4 plataformas.

**`stack-*` ahora por detección de stack.** Antes se instalaban `stack-nestjs/nextjs/prisma` en
cualquier proyecto (rompía la portabilidad: un repo Go/Python recibía skills de frameworks JS).
Ahora se detectan desde `package.json` (`@nestjs/* → stack-nestjs`, `next → stack-nextjs`,
`@prisma/client|prisma → stack-prisma`). Genéricos (`project-testing`, `project-ui`) siempre. En
greenfield (sin `package.json`) no se instala ninguna `stack-*` y se imprime un hint para re-ejecutar
`orbit init` cuando el stack se defina (decisión elegida por el usuario sobre el caso greenfield). La
detección corre **antes** del paso de OpenSpec, así lee el `package.json` real del usuario y no el
mínimo que `ensurePackageJson` pudiera crear. El índice de skills lista solo las instaladas.

**`orbit-tdd` como skill dedicada: descartado.** Ya se consolidó dentro de `orbit-builder` +
inyección en `openspec/config.yaml` en la ronda 1; recrearla revertiría el adelgazamiento. TDD se
queda en esas dos capas.

**Bonus:** corregido el resumen obsoleto de `orbit-qa-verifier` ("OpenSpec verify" → "structural
validation (openspec validate)").

**Tests:** añadidos casos de greenfield (ninguna stack + hint) y detección selectiva; el test
principal ahora aporta un `package.json` y verifica que `orbit-openspec-sdd-flow` ya no se genera y
que la referencia `/opsx:` está en `AGENTS.md`. Los 8 tests pasan.

### Pendiente (siguientes rondas)
- (Opcional) Podar `stack-*` que dejen de coincidir al re-ejecutar `orbit init` si la dep desaparece
  del `package.json` (hoy no se podan para no borrar skills que el usuario haya personalizado).
- Probar el harness en un proyecto real y registrar hallazgos en el Iteration Log de FLOW_MAPPING.
