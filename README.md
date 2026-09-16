# Life Sim v13.1 — Living Biosphere

Esta versión resuelve dos problemas prácticos de v13:

1. navegación limitada por el mapa;
2. colapsos completos de población al acelerar mucho el tiempo.

## Navegación

Controles nuevos:

- **clic izquierdo + arrastrar**: rotar cámara;
- **clic derecho + arrastrar**: desplazar cámara por el terreno;
- **botón central + arrastrar**: desplazar cámara;
- **rueda**: zoom;
- **W/A/S/D**: recorrer el mapa;
- **flechas**: recorrer el mapa;
- **Shift + movimiento**: desplazamiento rápido;
- **doble clic en el terreno**: centrar la cámara en esa zona.

El objetivo de cámara queda limitado al radio del mundo para no perderse fuera del escenario.

## Por qué v13 podía extinguirse incluso a máxima velocidad

La velocidad no protegía a la población; solamente hacía transcurrir el tiempo biológico más rápido.

Además había un cuello de botella concreto en reproducción.

La probabilidad base era:

`0.0125 × excedente de energía × edad × densidad × cerebro × salud`

El factor de excedente de energía empezaba en **cero** justo al superar el umbral reproductivo.

Ejemplo aproximado con la configuración anterior:

- energía 75: un evento reproductivo podía tardar del orden de cientos de unidades de tiempo;
- vida máxima típica: alrededor de 300 unidades.

Eso hacía perfectamente posible que muchos individuos adultos murieran sin dejar suficiente descendencia.

EvoDevo también añadió costos nuevos —cerebro, conexiones, desarrollo y movimiento—, aumentando la fragilidad de las primeras generaciones.

## Reproducción v13.1

Se cambió a una función menos frágil:

- energía mínima: 60;
- costo reproductivo: 20;
- madurez reproductiva desde 18;
- la fertilidad tiene un piso incluso cerca del umbral de energía;
- poblaciones pequeñas reciben una mayor oportunidad reproductiva;
- la probabilidad usa una forma exponencial estable con respecto al `dt`.

Esto no garantiza que cada **linaje** sobreviva. La selección todavía puede eliminar linajes malos.

## Biosfera continua

Ahora existe un banco ecológico dormante.

Cuando quedan muy pocos organismos:

- el archivo evolutivo puede aportar ocasionalmente un embrión dormante;
- se priorizan genomas que ya demostraron supervivencia;
- siguen existiendo mutaciones.

Si población activa = 0 y embriones = 0:

- el universo **no se pausa**;
- se registra una recolonización;
- aumenta el número de origen;
- se crean semillas/embriones dormantes;
- se restaura una cantidad mínima de productores/alimento;
- la simulación continúa.

Así distinguimos:

**extinción de linaje** → totalmente permitida  
**colapso de población macroscópica** → posible  
**universo muerto para siempre** → evitado

Esto mantiene selección natural sin obligarte a pulsar manualmente “Crear nuevo origen” cada vez.

## Máxima velocidad

v13 usaba hasta 64 subpasos biológicos y podía llegar a pasos de aproximadamente `0.06–0.08`.

v13.1 aumenta el máximo a 80 subpasos y limita cada paso a `0.05`.

Esto reduce saltos temporales en:

- alimentación;
- reproducción;
- sensores;
- contacto;
- envejecimiento.

Aun así, 100× sigue siendo un **modo de evolución acelerada**, no la forma más precisa de observar comportamiento individual.

Para observar biomecánica y aprendizaje motor:

- 1×–12× recomendado.

Para observar tendencias evolutivas:

- 20×–50×.

Para pruebas largas:

- 100×.

## Persistencia

Se mantiene IndexedDB y avance offline.

También se guardan:

- número de recolonizaciones;
- actividad del banco ecológico.

Un mundo antiguo guardado que ya estaba en población 0 se recoloniza automáticamente al abrirse.

## GitHub Pages

Reemplaza:

- `index.html`
- `simulation.js`
- `README.md`

Haz **Commit changes** y luego **Ctrl + F5**.

Debe aparecer:

- `Motor cargado: v13.1.3`
- `Recolonizaciones`
- `Riesgo demográfico`

Prueba también:

- clic derecho + arrastrar;
- W/A/S/D;
- doble clic en otra zona del suelo.
