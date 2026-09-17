# Life Sim v17.3.3 — Behavioral Unlock

Esta revisión es un ajuste quirúrgico sobre v17.3.

No añade una nueva capa de inteligencia. Corrige cuatro sistemas que seguían en cero o en una zona demasiado restrictiva durante ejecuciones largas.

> Nota de versión: el motor anterior ya era `v17.3.2`, por eso este parche se publica como `v17.3.3`.

## 1. Balance energético

En v17.3 la población y fertilidad mejoraron, pero la energía promedio seguía alrededor de 40–45 a pesar de existir abundante alimento.

Cambios moderados:

- metabolismo basal: `0.178 → 0.160`;
- coste de movimiento: `0.095 → 0.088`;
- alimento natural ligeramente más energético;
- biomasa proveniente de cadáveres también conserva algo más de energía.

No existe regeneración gratuita.

Los organismos todavía tienen que encontrar y consumir alimento.

El objetivo es que una criatura que consigue comida con regularidad pueda mantener una reserva energética razonable.

## 2. Reciprocidad desbloqueada

El principal problema era circular:

- un individuo podía recibir recursos;
- pero para devolverlos necesitaba tener más de 60 de energía;
- la energía promedio del mundo estaba alrededor de 44;
- por tanto casi nadie podía completar el segundo lado del intercambio.

Ahora una devolución puede ser pequeña.

Un organismo puede devolver parte de un favor si:

- recuerda que recibió más de lo que dio;
- tiene una predisposición suficiente a reciprocidad;
- no está en déficit energético severo;
- vuelve a encontrarse con el otro individuo.

No existe una obligación de corresponder.

## 3. Marcas físicas por arrastre real

v17.3 acumulaba raspado principalmente en el organismo que llevaba una herramienta.

v17.3.3 añade otra vía puramente física:

un material duro o con borde que sea realmente empujado sobre el terreno acumula `groundScrapeWork`.

Si el trabajo de contacto supera un umbral, el objeto deja una marca exactamente en su posición.

Esto permite:

piedra arrastrada → rayón accidental → otro organismo observa rayón → posible asociación cultural.

No se programa un significado.

## 4. Selección cultural equilibrada

v17.2/v17.3 eliminaron la inflación de procedimientos, pero el filtro quedó tan fuerte que `Procedimientos tecnológicos` podía permanecer en cero.

Un procedimiento estable ahora necesita:

- al menos 3 experiencias;
- al menos 1 resultado positivo;
- valor aprendido positivo;
- puntuación cultural mínima.

Los cambios físicos beneficiosos pesan un poco más.

La copia cultural sigue siendo selectiva y es ligeramente menos frecuente que antes.

Por tanto no deberíamos volver a cientos de tradiciones triviales, pero una técnica repetidamente útil sí tiene una ruta alcanzable para consolidarse.

## Qué observar

En el panel principal:

- Energía promedio
- Individuos fértiles
- Balance poblacional
- Procedimientos tecnológicos
- Relaciones recíprocas

En Diagnóstico avanzado:

- Marcas persistentes
- Símbolos externos compartidos
- Comidas últimos 100
- Reciprocidad promedio

Los tres ceros que especialmente queremos romper de forma emergente son:

- Procedimientos tecnológicos
- Relaciones recíprocas
- Marcas persistentes

## Compatibilidad

Puede abrir directamente un mundo guardado de v17.3.

No necesitas reiniciar.

## GitHub Pages

Reemplaza:

- `index.html`
- `simulation.js`
- `README.md`

Haz **Commit changes** y después **Ctrl + F5**.

Debe aparecer:

**Motor cargado: v17.3.3**
