# Life Sim v13.0 — EvoDevo Minds

La v13 amplía **qué puede evolucionar**, en vez de agregar una nueva conducta prefabricada.

## 1. Topología cerebral evolutiva

El cerebro ahora tiene máscaras heredables de conectividad. Pueden aparecer o desaparecer conexiones entre sensores,
neuronas recurrentes y salidas motoras/conductuales. También evoluciona la ganancia de cada neurona.

El número de neuronas ocultas puede evolucionar aproximadamente entre 8 y 64.

Las conexiones tienen un pequeño costo metabólico, así que un cerebro más grande no siempre es mejor.

## 2. Modelo predictivo

Cada criatura aprende una aproximación de:

**estado + acción → siguiente estado corporal/sensorial**

Predice energía, salud, proximidad de alimento/seres/materiales, tacto, dolor, propiocepción, interocepción y eficiencia motora.

El error entre la predicción y lo que ocurre realmente genera una recompensa de curiosidad pequeña y decreciente.
Cuando algo ya es predecible, deja de ser tan informativo.

Los genes `predictiveDrive` y `modelLearning` también evolucionan.

## 3. EvoDevo

El genoma incorpora un programa de desarrollo:

- duración del desarrollo;
- momento de crecimiento de extremidades;
- maduración sensorial;
- maduración neural;
- curva de crecimiento del torso y extremidades;
- proporción juvenil de la cabeza;
- plasticidad ante carga mecánica;
- plasticidad ante nutrición.

Los juveniles ya no son solamente adultos reducidos a escala.

Mientras crecen, actividad, carga y nutrición pueden alterar ligeramente el fenotipo sin cambiar directamente el ADN.
Los descendientes heredan el programa de desarrollo, no exactamente el cuerpo adquirido.

## 4. Física y crecimiento

Las extremidades físicas de Rapier crecen con el programa EvoDevo. Cuando cambian demasiado de tamaño, el rig rígido se reconstruye.

Los sensores y el funcionamiento neural también maduran gradualmente.

## 5. Qué observar

En pruebas largas pueden aparecer:

- cerebros grandes, pequeños, densos o dispersos;
- linajes que maduran sensores temprano;
- linajes que priorizan desarrollo locomotor;
- organismos muy curiosos;
- organismos conservadores;
- distintas estrategias de costo cerebral vs capacidad predictiva.

Nada garantiza inteligencia avanzada. El objetivo es ampliar el espacio de posibilidades de la selección natural.

## Estadísticas nuevas

- conexiones activas promedio;
- topologías distintas;
- error predictivo promedio;
- desarrollo promedio.

El panel individual muestra genes EvoDevo, conectividad, mutación topológica, aprendizaje predictivo y sorpresa actual.

## Compatibilidad

v13 migra mundos persistentes de v12. Los cerebros antiguos empiezan conservando sus conexiones y desde ese punto su topología puede evolucionar.

Se mantienen Rapier, persistencia IndexedDB, avance offline, embriones dormantes y archivo evolutivo.

## GitHub Pages

Reemplaza `index.html`, `simulation.js` y `README.md`, haz **Commit changes** y después **Ctrl + F5**.

Debe aparecer `Motor cargado: v13.0.6`.
