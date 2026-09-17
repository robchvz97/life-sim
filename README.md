# Life Sim v17.7.3 — Natural Demographic Stability

Esta revisión no aumenta artificialmente la fertilidad. Su objetivo es descubrir por qué una población aparentemente sana termina dependiendo del banco evolutivo.

## Cambio principal: rescate por episodios

Antes, `Rescates últimos 100` podía confundirse con episodios de rescate, aunque el contador de inserciones registra individuos añadidos.

Ahora se distinguen:

- Individuos de rescate: número de organismos insertados por el banco.
- Episodios de rescate: cuántas intervenciones independientes ocurrieron.
- Rescates por población crítica.
- Rescates por falta de fertilidad.
- Rescates al cargar una partida ya comprometida.
- Última causa de rescate.

La lógica del rescate mantiene el mismo umbral y cooldown de v17.7.2.

## Diagnóstico reproductivo

En Diagnóstico avanzado aparecen:

- Parejas fértiles cercanas: pares que actualmente están dentro del radio reproductivo de 2.4.
- Distancia media al fértil más cercano.
- Fértiles aislados: fértiles cuyo fértil más cercano está fuera del radio reproductivo.
- Encuentros fértiles últimos 100: episodios en que dos fértiles entraron en rango. Un mismo par se registra como máximo una vez cada 6 unidades de tiempo, para no contar cada tick.
- Apareamientos últimos 100.
- Adultos bloqueados por energía.
- Adultos en cooldown reproductivo.
- Tiempo desde el último nacimiento natural.

## Qué permite distinguir

Si hay fértiles pero casi todos están aislados, el cuello de botella es espacial.

Si existen parejas cercanas y muchos encuentros pero pocos apareamientos, el problema está en compatibilidad/probabilidad reproductiva.

Si muchos adultos aparecen bloqueados por energía, el problema es energético.

Si hay apareamientos pero el tiempo entre nacimientos sigue siendo largo, se revisará la gestación/embrión o creación de descendencia.

Si no existen fértiles durante periodos largos, se revisará ciclo vital, edad reproductiva y longevidad.

## Importante

v17.7.3 es deliberadamente observacional. No multiplica la tasa de fertilidad y no obliga a buscar pareja.

Esto evita “arreglar” la población sin saber qué estaba fallando.

## Compatibilidad

Carga directamente el mundo v17.7.2. Los nuevos contadores empiezan desde la instalación del parche; los rescates históricos anteriores siguen visibles en Historia, pero no se inventan causas retroactivas para ellos.

## GitHub Pages

El motor esperado es:

**v17.7.3**
