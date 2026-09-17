# Life Sim v17.5.4 — Goal-Directed Locomotion

Esta revisión se enfoca en sujetos que todavía describían bucles o cambiaban de dirección de forma torpe.

## Cambios principales

### Inercia cognitiva

Una nueva opción no sustituye a la tarea actual solo por ser marginalmente mejor.

Para cambiar de objetivo necesita superar un margen dependiente de persistencia e impulsividad.

Hambre severa, dolor y peligro pueden interrumpir de inmediato.

### Sin ruido aleatorio normal

La puntuación de acciones ya no recibe una perturbación aleatoria en cada decisión.

La exploración continúa, pero procede de novedad espacial y memoria.

### Planificador local

Una vez elegido un objetivo, la capa motora evalúa varias direcciones cercanas según:

- progreso hacia la meta;
- otros organismos;
- materiales;
- estructuras;
- borde del mundo;
- giro necesario.

No conoce el mapa completo y no usa una ruta perfecta.

### Memoria de trayectoria

Cada organismo conserva una pequeña historia de posiciones.

Si vuelve varias veces a la misma zona sin reducir suficientemente la distancia a su objetivo, se considera que la política motora está fallando.

Entonces:

- recibe una señal negativa;
- libera la decisión;
- cambia el sesgo lateral;
- vuelve a planear.

### Distancia social

Para aproximarse a otro organismo ya no intenta alcanzar exactamente el centro del cuerpo.

Calcula una distancia de llegada dependiente del tamaño y alcance corporal.

Esto reduce persecuciones circulares.

### Girar antes de avanzar

Cuando el error angular es grande, el movimiento hacia adelante cae casi a cero.

La secuencia se acerca más a:

girar → alinearse → avanzar → desacelerar → llegar.

## ¿Todo funciona con redes neuronales?

No.

Cada organismo sí posee una red neuronal recurrente/evolutiva que recibe sensores y genera salidas motoras, sociales, vocales y de manipulación.

Pero el universo contiene leyes y subsistemas explícitos:

- física;
- energía y metabolismo;
- reproducción;
- materiales;
- clima;
- sensores;
- memoria;
- reflejos;
- recompensas;
- persistencia;
- controlador motor.

La red neuronal opera dentro de esas leyes.

En v17.5.4 la elección de metas continúa dependiendo del cerebro y del aprendizaje, mientras el planificador local funciona como una capa sensorimotora general para ejecutar una intención sin los bucles artificiales que producía el controlador anterior.

## Compatibilidad

Puede cargar un mundo v17.5.

No necesitas reiniciar.

## GitHub Pages

Reemplaza:

- `index.html`
- `simulation.js`
- `README.md`

Haz Commit changes y después Ctrl + F5.

Debe aparecer:

**Motor cargado: v17.5.4**
