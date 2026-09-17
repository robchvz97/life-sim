# Life Sim v17.6.5 — Terrain Safety & Soil Drainage

Esta revisión corrige dos problemas observados en una partida real v17.6.4.

## 1. Organismos enterrados o atorados

En modo **Rapier rígido**, una criatura podía penetrar parcialmente el `trimesh` del relieve y quedarse atrapada.

Esto puede ocurrir especialmente cuando:

- el cuerpo tiene una morfología muy baja o ancha;
- cae sobre una arista entre triángulos;
- la física avanza varias sub-etapas por cuadro;
- una extremidad atraviesa una pendiente antes de que Rapier resuelva el contacto.

v17.6.5 añade una comprobación física de penetración.

No mira la malla visual del organismo: compara los colliders del torso y las extremidades contra `terrainHeightAt()`.

Una pequeña penetración sigue siendo válida como contacto normal.

Solo si existe penetración profunda y sostenida:

- todo el rig rígido se eleva únicamente la distancia necesaria;
- se amortigua parte de su velocidad;
- recibe presión/equilibrio como señal corporal;
- continúa la simulación.

Esto es una corrección de colisión, no una acción de comportamiento ni un rescate demográfico.

Se añade la métrica:

**Recuperaciones del terreno**

## 2. Suelo sobresaturado

En la captura recibida la humedad media del suelo estaba cerca del máximo mientras la cobertura vegetal era 0%.

La causa era que la lluvia e infiltración podían llenar la humedad del suelo más rápido de lo que la evaporación la retiraba.

Ahora existe **drenaje profundo**.

Cada celda tiene una capacidad de campo dependiente de su permeabilidad.

Por encima de esa capacidad:

- el exceso drena gradualmente;
- una pequeña parte puede reaparecer como filtración superficial;
- el resto representa agua que continúa hacia capas profundas.

Así el terreno ya no debería quedarse permanentemente pegado al máximo de humedad.

Se añade la métrica:

**Suelo sobresaturado**

## Recuperación de vegetación

Si la biomasa cayó casi a cero pero temperatura y humedad vuelven a condiciones favorables, existe una recuperación débil desde un banco de semillas ambiental.

No crea alimento directamente.

Solo permite que la biomasa natural vuelva a colonizar suelo apto después de un periodo de saturación, sequía o inundación.

## Compatibilidad

Puede cargar directamente el mismo mundo v17.6.4.

No es necesario reiniciar.

De hecho es útil mantenerlo: la humedad excesiva de la partida actual debería empezar a drenar gradualmente.

## Qué observar

Después de instalar, revisa:

- Recuperaciones del terreno
- Humedad del suelo
- Suelo sobresaturado
- Cobertura vegetal
- Nacimientos naturales últimos 100
- Muertes últimos 100
- Individuos de rescate

El contador de recuperaciones puede subir ocasionalmente. Si sube de forma constante y rápida, significa que todavía existe un problema con el collider del relieve.

## GitHub Pages

Reemplaza:

- `index.html`
- `simulation.js`
- `README.md`

Haz **Commit changes** y después **Ctrl + F5**.

Debe aparecer:

**Motor cargado: v17.6.5**
