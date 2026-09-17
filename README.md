# Life Sim v17.6.3 — Terrain Relief & Watersheds

Esta revisión convierte la elevación del mundo en relieve físico visible.

## Montañas, colinas y valles

El terreno combina ondas de gran escala con varias formaciones geológicas suaves.

Aparecen:

- montañas;
- lomas;
- crestas;
- valles;
- depresiones;
- una cuenca real alrededor del estanque permanente.

No son modelos decorativos colocados encima de un piso plano.

La propia superficie del mundo cambia de altura.

## Altura física

La función `terrainHeightAt(x,z)` interpola la altura entre las celdas ecológicas.

En modo turbo/híbrido los organismos se apoyan sobre esa altura.

Los alimentos, materiales, marcas, vegetación, barro y estructuras también utilizan el relieve.

## Física Rapier

Cuando Rapier está activo, v17.6.3 intenta construir un collider triangular a partir del mismo mapa de alturas que se dibuja.

Esto permite que cuerpos rígidos interactúen con pendientes reales.

Si el navegador/Rapier no acepta el collider triangular por alguna razón, existe un suelo plano de respaldo para evitar que la simulación deje de funcionar.

## Coste de subir

La locomoción utiliza:

- pendiente local;
- dirección de desplazamiento;
- barro;
- agua superficial;
- compactación.

Subir cuesta más energía y reduce velocidad.

Bajar puede ser ligeramente más eficiente, dentro de límites pequeños.

No existe una orden `subir montaña`.

## Navegación por pendiente

El planificador local compara posibles direcciones y penaliza:

- ascensos bruscos;
- pendientes muy fuertes;
- obstáculos;
- bordes del mundo.

Por tanto un organismo puede descubrir una ruta alrededor de una elevación si resulta físicamente más fácil.

No posee conocimiento global del mapa.

## Cuencas e hidrología

El agua ya no decide su escurrimiento usando solo un valor abstracto de elevación.

Compara la altura física de celdas vecinas.

La lluvia puede desplazarse desde zonas altas hacia zonas bajas y acumularse en depresiones.

La cuenca del estanque permanente se genera más baja que el terreno circundante.

## Clima de altura

La temperatura disminuye ligeramente con la altitud.

Esto puede hacer que una montaña tenga condiciones ecológicas distintas a las de un valle.

## Visualización

En Diagnóstico avanzado se añaden:

- Altura máxima
- Pendiente media

La escala vertical está moderada para mantener el mundo navegable.

## Compatibilidad

Puede cargar directamente un mundo v17.6.2.

No es necesario reiniciar.

El relieve se genera de manera determinista al cargar el mundo, mientras humedad, vegetación, compactación y agua continúan desde la partida guardada.

## Importante

La sintaxis y la estructura de archivos fueron validadas, pero el collider `trimesh` de Rapier debe comprobarse en el navegador real porque este entorno no ejecuta la escena completa Three.js/Rapier.

## GitHub Pages

Reemplaza:

- `index.html`
- `simulation.js`
- `README.md`

Haz **Commit changes** y después **Ctrl + F5**.

Debe aparecer:

**Motor cargado: v17.6.3**
