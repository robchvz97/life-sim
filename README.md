# Life Sim v4.0 — Vida Artificial Social

Esta versión agrega un sistema de **estados afectivos computacionales** y relaciones persistentes.

## Importante

Las variables llamadas “miedo”, “ira”, “apego”, “valencia”, etc. son estados internos de la simulación.
No significan que las criaturas tengan sentimientos conscientes. Sirven para que su historia modifique
sus decisiones de una forma más parecida a un organismo adaptativo.

## Novedades

### Estados afectivos dinámicos

Cada criatura mantiene:

- valencia: experiencia interna positiva/negativa;
- activación: nivel de excitación;
- miedo;
- ira;
- apego;
- curiosidad.

Cambian por hambre, heridas, seguridad, encuentros y memoria.

### Temperamento heredable

Los genes pueden producir individuos más o menos:

- sociables;
- agresivos;
- temerosos;
- propensos al apego;
- curiosos;
- empáticos;
- impulsivos;
- plásticos para aprender durante su vida.

No se asignan “personalidades” fijas: son valores continuos que pueden mutar.

### Relaciones individuales

Cada criatura recuerda individuos concretos con variables separadas:

- afinidad;
- amenaza;
- confianza;
- encuentros;
- daño recibido;
- ayuda recibida;
- patrones sonoros.

Por eso una criatura puede tratar de forma distinta a dos individuos de la misma población.

### Afiliación

Cuando la red neuronal lo decide, un encuentro cercano puede:

- aumentar afinidad;
- aumentar confianza;
- reducir tensión;
- reforzar apego;
- transferir una pequeña cantidad de energía a un individuo necesitado.

Esto permite vínculos duraderos sin programar “amistad”.

### Agresión y brutalidad emergente

Existe una acción física de ataque.

La probabilidad depende de:

- salida de la red neuronal;
- agresividad heredada;
- ira;
- activación;
- memoria de amenaza;
- afinidad previa;
- impulsividad;
- inhibición neural.

Los objetos duros o largos que lleve una criatura pueden aumentar el daño físico. No hay una clase
“guerrero” o “asesino”; si aparece comportamiento extremadamente agresivo sería una combinación
emergente de estas variables.

### Salud y heridas

Ahora energía y salud son diferentes.

Los ataques dañan salud. Una criatura bien alimentada y tranquila puede recuperarse lentamente.

### Aprendizaje durante la vida

Además de evolución entre generaciones, cada criatura posee una plasticidad neuronal simple.

Los cambios en:

- energía,
- salud,
- valencia,
- miedo

generan una señal de recompensa o castigo que modifica levemente conexiones de salida de su cerebro.

Así dos criaturas con genomas parecidos pueden terminar comportándose distinto por sus experiencias.

### Sonido social

La comunicación sonora de la v3.0 sigue presente y ahora puede quedar asociada a relaciones concretas.

Una criatura puede recordar el tono aproximado de otra y combinar esa información con afinidad,
amenaza o confianza.

### Mundo material

Se conservan:

- fibra;
- piedra;
- mineral;
- biomasa;
- transporte de objetos;
- herramientas físicas primitivas;
- estructuras emergentes;
- biomasa, agua y alimento;
- sonido;
- evolución corporal.

## Qué observar

Haz clic en una criatura y observa:

- su estado afectivo;
- su temperamento genético;
- su salud;
- sus relaciones más fuertes;
- si recuerda a otro individuo como confiable o amenazante;
- cómo cambia su comportamiento después de un ataque o una interacción positiva.

## Actualizar GitHub Pages

Reemplaza en tu repositorio:

- `index.html`
- `simulation.js`
- `README.md`

Haz **Commit changes** y GitHub Pages se volverá a desplegar automáticamente.

## Ideas para v5

Una siguiente versión podría incluir:

- reproducción entre dos progenitores y elección de pareja emergente;
- cuidado de crías;
- reconocimiento de parentesco;
- transmisión social de conductas;
- imitación;
- aprendizaje por observación;
- grupos/coaliciones emergentes;
- memoria espacial;
- territorios;
- sueño/descanso;
- ciclos de día y noche;
- enfermedades y resistencia genética;
- guardado permanente del universo.
