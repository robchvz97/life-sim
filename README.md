# Life Sim v0.1 — Vida Artificial 3D

Prototipo inicial de una simulación de vida artificial en 3D.

## Qué incluye

- Mundo 3D con tierra, agua y luz solar.
- Criaturas con cuerpos variables: tamaño, número de extremidades, velocidad, sensores y color.
- Cerebros simples basados en una red neuronal recurrente heredable.
- Memoria persistente durante la vida de cada criatura.
- Reproducción con mutaciones.
- Metabolismo y energía.
- Alimento que reaparece de manera ambiental.
- Muerte y reciclaje de energía: los cuerpos muertos vuelven al mundo como nutrientes.
- Señales primitivas entre criaturas, sin significado preprogramado.
- Inspección individual de cada criatura.
- Controles para acelerar el tiempo, cambiar la tasa de mutación y la luz solar.

## Filosofía

La simulación evita reglas de comportamiento del tipo:

- “ve por comida”
- “haz amigos”
- “construye una casa”
- “ataca”
- “coopera”

En cambio, solo existen reglas universales del mundo: energía, movimiento, percepción, límites físicos, reproducción, muerte y mutación. El comportamiento surge del cerebro de cada criatura.

## Cómo abrirla

### Opción rápida
Por seguridad del navegador, los módulos de Three.js funcionan mejor desde un servidor local.

Con Python instalado:

```bash
python -m http.server 8000
```

Después abre:

```text
http://localhost:8000
```

### GitHub Pages

1. Crea un repositorio nuevo en GitHub.
2. Sube `index.html` y `simulation.js` a la raíz.
3. Ve a **Settings → Pages**.
4. En **Build and deployment**, selecciona **Deploy from a branch**.
5. Selecciona `main` y carpeta `/ (root)`.
6. Guarda.

GitHub te dará una URL pública para abrir la simulación.

## Próximas evoluciones recomendadas

- Genoma corporal más libre: segmentos que puedan aparecer/desaparecer y articulaciones reales.
- Evolución de sensores.
- Sistema físico con colisiones y objetos manipulables.
- Materiales combinables para que puedan emerger construcciones sin programarlas.
- Redes neuronales más grandes y plasticidad durante la vida.
- Memoria episódica real y recuerdos de individuos concretos.
- Comunicación acústica o visual evolutiva.
- Linajes y árbol genealógico.
- Persistencia del mundo en IndexedDB.
- Modo “observador externo” para que las criaturas puedan percibir tus intervenciones.
- Exportar/importar universos completos.

## Nota técnica

Esta v0.1 es un prototipo experimental. No implica conciencia, intención o inteligencia general. Está diseñada para que podamos ir abriendo grados de libertad y estudiar qué comportamientos emergen.
