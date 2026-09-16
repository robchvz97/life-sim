# Life Sim v9.1 — Nervous System (corrección)

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
