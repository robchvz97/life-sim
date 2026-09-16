# Life Sim v9.2 — Nervous System (corrección)

Esta revisión corrige el arranque de v9.0.

## Qué se corrigió

### 1. Dependencia de OrbitControls eliminada
La v9.0 cargaba `OrbitControls.js` desde un módulo externo adicional. Si ese segundo módulo o su
resolución de dependencias fallaba, **todo `simulation.js` dejaba de ejecutarse**, por eso el panel
podía quedarse en:

- Población: 0
- Motor cargado: esperando…
- Render 3D: esperando…

v9.1 usa un control de cámara ligero incluido directamente dentro de `simulation.js`.
Ahora solo depende del módulo principal de Three.js.

### 2. Cargador con diagnóstico visible
`index.html` ahora carga la simulación mediante `import()` con manejo de errores.

Si el motor no puede arrancar, el panel mostrará:

- `ERROR AL CARGAR`
- y una descripción breve en `Render 3D`

en vez de quedarse indefinidamente en “esperando…”.

### 3. Dimensión neural corregida
El cerebro original tenía 44 entradas.
El sistema nervioso añadió 15 entradas nuevas.

Total correcto:

**59 entradas**

La v9.0 estaba configurada para 56. Eso podía producir valores `NaN` después de iniciar la simulación.

v9.1 usa 59 entradas y además comprueba automáticamente que el tamaño del cerebro coincida con los sensores.

## Se mantiene todo lo de v9

- tacto;
- dolor / nocicepción;
- propiocepción;
- equilibrio;
- interocepción;
- temperatura;
- fatiga;
- reflejos;
- retraso nervioso;
- genética sensorial;
- cuerpos orgánicos de v8;
- anatomía visible;
- panel minimizable.

## Actualizar GitHub Pages

Reemplaza:

- `index.html`
- `simulation.js`
- `README.md`

Haz **Commit changes** y luego `Ctrl + F5`.

Debe aparecer:

- `Motor cargado: v9.1.1`
- `Render 3D: activo · 38 seres`
- población inicial alrededor de 38.


## Corrección v9.2

La v9.1 tenía un error de sintaxis dentro de `attack()`:

- se declaraba el identificador `nm` dos veces en el mismo bloque;
- el navegador detenía todo el módulo antes de iniciar la simulación;
- por eso aparecía `Identifier 'nm' has already been declared`.

v9.2 renombra esas variables de forma explícita:

- `attackerMorph`
- `targetMorph`
- `targetMemory`

y fue validada como módulo ES (`node --input-type=module --check`).

Motor esperado: `v9.2.0`.


### Segunda corrección detectada

También había un `}` extra después de `decisionInputs()`, introducido al ampliar el cerebro con
las 15 entradas nerviosas. Ese cierre sobrante también impedía que el módulo JavaScript arrancara.

La versión empaquetada ahora pasa una validación real como **ES module** completa.
