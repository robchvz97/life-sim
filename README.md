# Life Sim v5.0 — Cognitive Update

Esta versión se enfoca menos en agregar objetos y más en mejorar el comportamiento.

## Qué cambia

### 1. Ya no recalculan el giro caóticamente cada frame

La criatura toma una decisión de atención y la mantiene durante aproximadamente 0.45–1.35 segundos,
modificada por un rasgo heredable de persistencia.

Eso elimina gran parte del patrón de "dar vueltas sin sentido".

También hay:

- inercia angular;
- zona muerta para giros pequeños;
- objetivo de dirección persistente;
- reducción de velocidad al acercarse al objetivo.

### 2. Memoria espacial

Cada individuo construye su propio mapa imperfecto:

- celdas visitadas;
- lugares donde encontró alimento;
- sitios asociados a interacciones sociales;
- lugares peligrosos;
- lugares con materiales.

No es un mapa global compartido.

### 3. Curiosidad y novedad

Las zonas poco visitadas generan una pequeña recompensa interna.

La intensidad depende de rasgos evolutivos:

- curiosidad;
- exploración.

Así algunos individuos pueden ser conservadores y otros mucho más exploradores.

### 4. Modelo interno simple de resultados

Cada criatura aprende una estimación de qué tan bien suele funcionar cada tipo de atención
en distintos contextos.

Los modos disponibles son:

- mantener trayectoria;
- atender comida;
- atender otro ser;
- atender un material;
- atender una estructura;
- volver a un recuerdo;
- explorar una zona nueva;
- alejarse.

IMPORTANTE: esto no significa que exista una orden "ve a comer".
El agente solo puede dirigir su atención hacia categorías perceptivas.
Las consecuencias de hacerlo son aprendidas.

El modelo guarda una estimación `Q` por contexto y modo.
Por ejemplo, una conducta que repetidamente termina asociada con pérdida de salud
adquiere menor valor esperado.

### 5. Aprendizaje neuronal durante la vida

Las consecuencias actualizan:

- el modelo de resultados;
- las conexiones de salida de la red neuronal mediante plasticidad modulada por recompensa.

La recompensa incluye:

- cambios de energía;
- cambios de salud;
- novedad espacial;
- algunos resultados sociales.

### 6. Sonido corregido

En versiones anteriores la señal podía quedar prácticamente inaudible porque:

- el volumen era muy pequeño;
- la salida neuronal podía permanecer cerca de cero;
- se usaban osciladores continuos demasiado suaves.

La v5 usa **llamadas breves ("chirps") con envolvente de volumen**.

Incluye:

- botón `Activar sonido`;
- botón `Probar sonido`;
- control de volumen;
- volumen mínimo útil;
- frecuencia genética;
- modulación por estado interno;
- intervalos de llamada controlados por la red;
- distintas formas de onda cuando el individuo está muy temeroso o alterado.

El navegador exige una interacción del usuario antes de reproducir audio.
Al pulsar `Activar sonido` debe escucharse inmediatamente una prueba de dos tonos.

### 7. Panel cognitivo

Haz clic en una criatura y podrás ver:

- qué está atendiendo;
- cuánto durará la decisión;
- valor esperado de su elección;
- recuerdos espaciales;
- celdas exploradas;
- recompensa reciente;
- modelo aprendido para los ocho modos;
- estado afectivo;
- sonido actual.

## Actualizar GitHub Pages

Reemplaza en tu repositorio:

- `index.html`
- `simulation.js`
- `README.md`

Haz **Commit changes**.

GitHub Pages volverá a desplegar automáticamente.

## Qué deberías observar

No esperamos "inteligencia humana", pero sí comportamientos menos erráticos:

- trayectorias más rectas;
- exploración sostenida;
- retorno a lugares donde antes hubo resultados positivos;
- evitación de zonas asociadas con daño;
- diferencias individuales;
- hábitos que cambian a lo largo de la vida.

## Siguiente salto posible

La v6 podría añadir un modelo predictivo más fuerte:

- aprender transiciones `estado + acción -> estado siguiente`;
- simular mentalmente varias acciones antes de elegir;
- memoria de secuencias, no solo lugares;
- imitación y aprendizaje observacional;
- transmisión social entre generaciones;
- guardado persistente del universo en IndexedDB.
