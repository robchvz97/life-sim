# Life Sim v17.6.4 — Observer Night Vision

Esta versión separa explícitamente la oscuridad que experimentan los organismos de la iluminación que recibe el observador humano.

## Luz de luna visual

La noche ya no se vuelve casi ilegible para quien observa.

Existe una iluminación azul muy suave que permite conservar:

- siluetas;
- relieve;
- agua;
- vegetación;
- organismos.

Esta luz es únicamente de renderizado.

## Visión del observador

Se añade el botón:

**👁 Visión del observador: OFF / ON**

Al activarlo aumenta:

- luz ambiental visible;
- una luz direccional de inspección;
- exposición nocturna.

El efecto es más fuerte durante la noche y mucho menor durante el día.

La preferencia se guarda en `localStorage`, por lo que puede conservarse al recargar la página.

## Importante: no altera el experimento

`daylightLevel()` continúa siendo el valor que usan los sistemas internos.

La Visión del observador NO se utiliza para:

- visión de los organismos;
- sensores;
- aprendizaje;
- temperatura;
- fotosíntesis/biomasa;
- evaporación;
- energía;
- comportamiento;
- navegación;
- selección natural.

Por tanto puedes inspeccionar el mundo de noche sin “darles una lámpara” a las criaturas.

## Compatibilidad

Puede cargar directamente un mundo v17.6.3.

No necesitas reiniciar.

## GitHub Pages

Reemplaza:

- `index.html`
- `simulation.js`
- `README.md`

Haz **Commit changes** y después **Ctrl + F5**.

Debe aparecer:

**Motor cargado: v17.6.4**
