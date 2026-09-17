# Life Sim v17.3.7 — Intentional Navigation

Esta revisión corrige dos problemas observados en v17.3.6:

- criaturas que caminaban o giraban en círculos sin progreso;
- morfologías que en modo turbo parecían parcialmente enterradas.

## Movimiento orientado a metas

La toma de decisiones continúa siendo neuronal.

Lo que cambia es la capa que ejecuta una decisión.

Una vez elegida una meta, el organismo:

1. conserva el destino durante varios ciclos;
2. gira hacia él;
3. reduce el avance mientras está mal orientado;
4. acelera al quedar alineado;
5. desacelera y se detiene al llegar.

## Sin giro aleatorio oculto

Antes, cuando se seleccionaba `mantener trayectoria`, el motor introducía una pequeña desviación aleatoria.

Eso fue eliminado.

`Mantener trayectoria` ahora conserva el rumbo.

## Exploración sistemática

La exploración ya no genera diez destinos aleatorios cada vez que el cerebro piensa.

Cada individuo examina una serie estable de direcciones y distancias y prefiere zonas menos visitadas.

La orientación del patrón cambia lentamente con el tiempo, permitiendo exploración sin convertir cada decisión en un giro nuevo.

## Aprender si realmente avanza

El organismo compara la distancia anterior y actual hacia su objetivo.

Acercarse puede reforzar la conducta.

Moverse sin reducir la distancia ya no recibe recompensa.

Si pasa suficiente tiempo sin progresar:

- la acción recibe una pequeña señal negativa;
- la decisión se libera;
- el cerebro puede replantear el objetivo.

Esto ayuda a romper bucles y órbitas.

## Criaturas parcialmente enterradas

En modo turbo/híbrido no existe un collider corporal completo.

Algunas combinaciones de piernas largas y proporciones podían extender visualmente partes del organismo bajo el suelo.

Ahora el modo híbrido calcula una separación del suelo aproximada a partir de la morfología.

La elevación es solo para el modo híbrido y no se guarda como altura real.

Al volver a Rapier rígido, la corrección visual se elimina y la física vuelve a controlar el contacto con el suelo.

## Importante

Esto no crea pathfinding perfecto.

Las criaturas todavía pueden:

- equivocarse;
- elegir una meta mala;
- abandonar un objetivo;
- explorar;
- aprender movimientos ineficientes.

La diferencia es que el controlador ya no premia simplemente “moverse”. Intenta convertir una decisión cognitiva en desplazamiento coherente.

## Compatibilidad

Puede cargar directamente un mundo v17.3.6.

No necesitas reiniciar.

## GitHub Pages

Reemplaza:

- `index.html`
- `simulation.js`
- `README.md`

Haz **Commit changes** y después **Ctrl + F5**.

Debe aparecer:

**Motor cargado: v17.3.7**
