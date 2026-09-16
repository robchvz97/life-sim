# Life Sim v9.0 — Nervous System

La v9 añade un sistema nervioso simplificado.  
La idea no es afirmar que estas criaturas “sienten” subjetivamente como un ser humano, sino que ahora
su cerebro recibe señales corporales más ricas sobre **qué le está ocurriendo al cuerpo**.

## Qué se agregó

### 1. Tacto distribuido
Cada criatura tiene un pequeño mapa táctil simplificado por regiones del cuerpo.

Puede recibir señales al tocar:

- alimento;
- otros seres;
- materiales;
- estructuras;
- agua;
- bordes del mundo;
- objetos que carga.

### 2. Dolor / nocicepción
Los ataques, choques y sobrecargas pueden producir señales de dolor.

Ese dolor entra como entrada a la red neuronal y también puede desencadenar reflejos de retirada.

### 3. Propiocepción y equilibrio
Ahora el cerebro recibe señales relacionadas con:

- movimiento del cuerpo;
- giros;
- inestabilidad;
- postura;
- tensión del desplazamiento.

Esto permite que el agente use datos internos del cuerpo, no solo visión y memoria.

### 4. Interocepción
Las criaturas también perciben señales internas, por ejemplo:

- hambre;
- fatiga;
- presión/carga;
- temperatura corporal aproximada.

### 5. Retraso nervioso
Las señales no llegan instantáneamente.

Cada criatura tiene un pequeño **retraso nervioso** heredable, y cuerpos más grandes pueden sufrir
un poco más de demora en la transmisión.

### 6. Reflejos
Si el cuerpo recibe suficiente dolor/inestabilidad, puede activarse un reflejo de retirada antes
de que el ciclo normal de decisión haga todo su trabajo.

Esto no sustituye al cerebro: es una respuesta rápida de seguridad.

## Nuevos genes sensoriales

Ahora también pueden evolucionar:

- densidad táctil;
- nocicepción;
- propiocepción;
- termosensibilidad;
- interocepción;
- velocidad de reflejo;
- retraso nervioso.

Más sensibilidad no es gratis: añade un pequeño costo energético.

## Qué ver en la interfaz

En el panel general aparecen:

- **Señales táctiles**
- **Dolor promedio**
- **Reflejos**

Al seleccionar una criatura verás:

- tacto total;
- dolor total;
- temperatura;
- presión/carga;
- propiocepción;
- equilibrio;
- interocepción;
- fatiga corporal;
- temperatura corporal;
- señales recibidas;
- reflejos disparados;
- genética sensorial.

## Actualizar GitHub Pages

Reemplaza:

- `index.html`
- `simulation.js`
- `README.md`

Haz **Commit changes** y luego **Ctrl + F5**.

Debe mostrarse:

- `Motor cargado: v9.0.3`
- criaturas visibles;
- estadísticas nerviosas nuevas.
