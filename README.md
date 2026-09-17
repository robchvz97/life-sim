# Life Sim v17.3.4 — Natural Viability & Hydrology

Esta revisión busca responder dos preguntas que las métricas anteriores no podían contestar con claridad:

1. ¿La biosfera realmente se reproduce sola?
2. ¿El agua que vemos fue adquirida por las reglas actuales o venía de un guardado anterior?

## Nacimientos naturales

`Nacimientos` ahora cuenta solo descendencia producida por reproducción normal.

Los individuos introducidos por el banco evolutivo no cuentan como nacimientos naturales.

Diagnóstico nuevo:

- Individuos de rescate
- Rescates últimos 100

## Rescate solo en emergencia

El banco ya no intenta mantener una población cultural de 24–34 individuos.

La población puede caer naturalmente.

Solo interviene cerca de un colapso real:

- población casi extinta;
- o menos de 8 individuos;
- cero fértiles;
- y más de 120 unidades sin un nacimiento natural.

Además existe un enfriamiento largo entre rescates.

Cuando interviene, recupera hacia aproximadamente 12 individuos, no hacia 34.

## Alimentación

Con energía baja, los recuerdos de lugares donde se comió tienen prioridad sobre recuerdos positivos genéricos.

Además, si una criatura hambrienta ya está físicamente en contacto con alimento, la ingestión puede actuar como un reflejo homeostático.

No se teletransporta comida y no se alimenta automáticamente a distancia.

## Agua nueva verificable

El diagnóstico separa:

- Agua heredada al cargar
- Agua nueva adquirida

Al abrir un mundo guardado, toda el agua existente se clasifica como heredada.

`Agua nueva adquirida` empieza desde cero y solo aumenta cuando recipientes obtienen agua nueva del entorno durante la sesión.

Fuentes:

- estanque;
- lluvia.

Las tasas de llenado se ajustaron para que contactos reales breves produzcan una cantidad medible.

## Marcas

v17.3.3 produjo muchas marcas, incluso alcanzando el límite.

Ahora existe selección de marcas.

Rayones que:

- nadie lee;
- nadie repite;
- permanecen abandonados;

desaparecen antes.

Marcas leídas, reforzadas o reutilizadas persisten más.

Si el mundo llega al límite, una marca nueva puede reemplazar a la de menor valor cultural.

## Qué observar

En el panel principal:

- Población
- Individuos fértiles
- Balance poblacional
- Energía promedio

En diagnóstico avanzado:

- Nacimientos naturales
- Nac. naturales últimos 100
- Individuos de rescate
- Rescates últimos 100
- Comidas últimos 100
- Agua heredada al cargar
- Agua nueva adquirida
- Captaciones de lluvia
- Contactos recipiente-agua
- Marcas persistentes
- Símbolos externos compartidos

## Señal de autosuficiencia

Una prueba fuerte sería observar varias generaciones con:

- nacimientos naturales compensando muertes;
- rescates últimos 100 = 0;
- energía estable;
- población fértil;
- agua nueva adquirida > 0.

Eso ya nos permitiría hablar de una biosfera mucho menos sostenida artificialmente.

## Compatibilidad

Puede cargar directamente tu mundo v17.3.3.

No necesitas reiniciar.

## GitHub Pages

Reemplaza:

- `index.html`
- `simulation.js`
- `README.md`

Haz **Commit changes** y luego **Ctrl + F5**.

Debe aparecer:

**Motor cargado: v17.3.4**
