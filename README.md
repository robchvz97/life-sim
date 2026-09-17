# Life Sim v17.6 — Living World & Ecology

v17.6 convierte el terreno en una parte funcional de la simulación.

El suelo ya no es únicamente una superficie verde.

Cada zona del mundo mantiene variables ambientales continuas:

- elevación local;
- humedad;
- agua superficial;
- fertilidad;
- biomasa vegetal;
- permeabilidad;
- compactación;
- temperatura.

No existen biomas rígidos llamados `pasto`, `barro` o `desierto`.

Esos aspectos aparecen visualmente como consecuencia de las variables.

## Día y noche

El mundo posee un ciclo diario.

La posición e intensidad del sol cambian gradualmente.

Durante el día:

- aumenta la iluminación;
- sube la temperatura;
- aumenta la evaporación;
- la percepción visual alcanza mayor distancia;
- la vegetación recibe más energía.

Durante la noche:

- baja la iluminación;
- disminuye la temperatura;
- cae la evaporación;
- la visión pierde alcance.

No existe una regla que ordene dormir.

Los organismos deben aprender/evolucionar bajo las condiciones cambiantes.

## Suelo

Cada celda tiene permeabilidad y fertilidad propias.

La lluvia puede:

- infiltrarse;
- aumentar humedad;
- acumular agua superficial;
- escurrir hacia zonas localmente más bajas.

La humedad excesiva puede formar barro y reducir la velocidad.

Una superficie compactada por tránsito puede ser ligeramente más fácil de recorrer.

## Vegetación

La biomasa depende de:

- humedad;
- fertilidad;
- temperatura;
- luz;
- compactación;
- inundación.

El alimento espontáneo aparece con mayor probabilidad en áreas ecológicamente favorables.

Por tanto el alimento ya no se distribuye de manera completamente uniforme.

## Agua superficial

El estanque original sigue siendo una fuente permanente.

Además, lluvias suficientemente intensas pueden producir agua superficial temporal.

Los organismos y recipientes pueden detectar/utilizar esa agua mediante los sistemas ya existentes.

## Senderos rudimentarios

Caminar repetidamente sobre una zona aumenta gradualmente la compactación.

La compactación:

- reduce biomasa;
- cambia la apariencia del suelo;
- puede reducir un poco el coste de desplazamiento.

No existe una acción `crear camino`.

Si aparecen rutas visibles será resultado del tránsito repetido.

## Nutrientes

La muerte de un organismo incrementa ligeramente la fertilidad local.

El consumo de alimento reduce una pequeña cantidad de biomasa vegetal.

Así existe una retroalimentación básica entre vida y suelo.

## Corrección de organismos mezclados

En modo turbo/híbrido no existen todos los colliders rígidos de Rapier.

Por eso varios organismos podían terminar ocupando casi la misma coordenada X/Z y sus cuerpos se dibujaban superpuestos.

v17.6 añade una separación corporal local en el modo híbrido.

No es una fuerza social.

Es una restricción física: dos cuerpos no deberían ocupar el mismo espacio.

La separación utiliza una cuadrícula espacial para no comparar todos los organismos contra todos en cada paso.

## Qué observar

En Diagnóstico avanzado aparecen:

- Ciclo diario
- Luz ambiental
- Humedad del suelo
- Cobertura vegetal
- Agua superficial
- Suelo compactado

Observa especialmente si:

- aparecen zonas verdes y secas diferentes;
- la lluvia modifica el mapa;
- aparecen pequeñas zonas con agua;
- el alimento se concentra en áreas productivas;
- el tránsito crea rastros en el terreno;
- los grupos dejan de verse fusionados unos dentro de otros.

## Compatibilidad

Puede cargar directamente un mundo v17.5.4.

No necesitas reiniciar.

Como los mundos antiguos no almacenaban suelo dinámico, v17.6 generará la ecología inicial al cargarlos y desde ese momento quedará guardada.

## GitHub Pages

Reemplaza:

- `index.html`
- `simulation.js`
- `README.md`

Haz Commit changes y después Ctrl + F5.

Debe aparecer:

**Motor cargado: v17.6.1**
