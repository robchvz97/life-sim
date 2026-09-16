# Life Sim v6.0 — Predictive Minds

La v6 se concentra en una idea: **que pensar tenga utilidad y costo**.

Las criaturas todavía no tienen inteligencia general ni conciencia. La simulación añade mecanismos
computacionales para que puedan aprender consecuencias, imaginar futuros simples, recordar secuencias
y aprender observando a otros.

## 1. Simulación mental del futuro

Antes de tomar una decisión, cada criatura puede evaluar varios modos posibles y recorrer mentalmente
una pequeña cadena de consecuencias aprendidas.

Su modelo aprende transiciones del tipo:

`contexto actual + acción -> recompensa + contexto probable siguiente`

Con esa información puede estimar varios pasos futuros sin tener que ejecutarlos primero.

La profundidad de planificación es un rasgo genético evolutivo entre 1 y 5 pasos.

En el panel de una criatura aparecen:

- `FUTUROS CONSIDERADOS`
- puntuación total de cada opción;
- valor de la parte futura imaginada.

## 2. Memoria de secuencias

Ya no recuerda solamente acciones aisladas.

Guarda cadenas cortas de decisiones, por ejemplo:

`zona nueva > comida > recuerdo`

Si una secuencia termina repetidamente con resultados favorables, esa secuencia comienza a sesgar
decisiones futuras.

La longitud máxima de las secuencias también puede evolucionar.

## 3. Imitación y aprendizaje observacional

Cuando una criatura ve a otra cercana obteniendo un resultado claro, puede aprender indirectamente
del modo de conducta observado.

No copia todo el cerebro de la otra.

Construye un modelo separado de:

`lo que vi hacer a otro + resultado observado`

El grado de imitación es heredable.

Los hijos tienen mayor facilidad para aprender observando a su progenitor cuando permanecen cerca.

## 4. Cultura rudimentaria

Las secuencias con resultados positivos pueden pasar de forma débil entre individuos por observación.

Al nacer, un hijo puede recibir únicamente una **prior cultural muy pequeña** de algunas secuencias
positivas del progenitor. No recibe sus recuerdos personales, mapa espacial ni experiencia completa.

La mayor parte del aprendizaje cultural tiene que ocurrir observando.

Esto permite que una conducta sobreviva más allá de un individuo sin convertirla directamente en un gen.

## 5. Evolución de la arquitectura cerebral

El tamaño de la capa recurrente ya no es fijo.

Puede evolucionar aproximadamente entre:

- 12 neuronas ocultas;
- 42 neuronas ocultas.

Una mutación puede aumentar o reducir la red y sus matrices se adaptan automáticamente.

## 6. Pensar cuesta energía

Una red más grande y una planificación más profunda añaden costo metabólico.

Por eso un cerebro grande no es automáticamente mejor.

Si un ambiente puede resolverse con un cerebro simple, la evolución puede favorecerlo.
Si anticipar, recordar o imitar ofrece suficiente ventaja, un cerebro más caro puede compensar su costo.

## 7. Qué observar

Selecciona una criatura.

Ahora puedes ver:

- neuronas ocultas;
- profundidad de planificación;
- número de futuros simulados;
- secuencias aprendidas;
- imitación acumulada;
- rasgo genético de imitación;
- rasgo genético de previsión;
- mejores futuros considerados;
- secuencias que han obtenido mejores resultados.

En el panel general aparecen:

- `Futuros simulados`;
- `Secuencias aprendidas`;
- `Imitaciones`;
- `Neuronas promedio`.

## 8. Audio

Se conserva el sistema de chirridos audibles de la v5.1:

- `Activar sonido`;
- `Probar sonido`;
- volumen configurable.

El navegador sigue requiriendo una interacción del usuario para activar Web Audio.

## Actualizar GitHub Pages

Reemplaza:

- `index.html`
- `simulation.js`
- `README.md`

Haz **Commit changes** y después una recarga fuerte (`Ctrl + F5`).

Comprueba:

- `Motor cargado: v6.0.3`
- `Render 3D: activo · ... seres`
- `Celdas exploradas` mayor que cero.

## Qué podría seguir en v7

La siguiente etapa natural sería hacer la cultura mucho más potente:

- aprendizaje de acciones completas por demostración;
- atención conjunta;
- cuidado y enseñanza de crías;
- reproducción entre dos progenitores;
- especialización social;
- coaliciones;
- territorios;
- memoria de objetos individuales;
- símbolos acústicos con asociaciones aprendidas;
- guardado permanente de universos y árboles genealógicos.
