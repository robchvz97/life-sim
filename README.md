# Life Sim v17.3 — Evolution Balance

v17.3 corrige desequilibrios detectados al observar ejecuciones largas de v17.2.

No añade una nueva “civilización”. Ajusta las leyes y métricas que estaban sesgando la evolución.

## 1. Homeostasis energética

En v17.2 podían existir cientos de alimentos y, aun así, la energía promedio mantenerse cerca de 40.

El problema era que hambre, curiosidad, cultura y exploración competían con pesos demasiado similares.

Ahora:

- la presencia de comida gana saliencia progresiva cuando cae la energía;
- la exploración pierde prioridad durante déficit severo;
- materiales/estructuras pierden algo de prioridad cuando el organismo está hambriento;
- el impulso de ingestión responde con más fuerza al estado energético;
- la recompensa de explorar se reduce durante déficit energético.

No se asigna comida automáticamente.

El organismo todavía debe percibirla y alcanzarla.

## 2. Fertilidad coherente con longevidad

La ventana fértil ya no termina en una edad global fija.

Cada individuo calcula una longevidad aproximada a partir de:

- tasa de envejecimiento;
- tamaño corporal.

Su edad máxima fértil depende de esa longevidad.

También se redujo el umbral energético reproductivo de 60 a 54 para que la reproducción sea compatible con el rango energético real del ecosistema.

Cuando existen muy pocos individuos fértiles, la fisiología reproductiva recibe un pequeño impulso demográfico.

## 3. Archivo evolutivo sin premio fuerte por edad

El banco usado para recuperaciones demográficas premiaba directamente la edad.

Eso podía favorecer organismos longevos aunque tuvieran poco éxito reproductivo.

v17.3 reduce la edad a un componente casi neutro.

El archivo favorece principalmente:

- descendencia real;
- generación;
- adquisición de alimento/energía;
- supervivencia funcional.

Así una recolonización debería depender menos de “vivir mucho” y más de haber funcionado dentro del ecosistema.

## 4. Marcas por raspado físico

La protoescritura tenía un cuello de botella: producir una marca dependía demasiado de eventos probabilísticos.

Ahora cada organismo acumula trabajo de superficie cuando:

- lleva un objeto suficientemente duro/afilado;
- se mueve o manipula;
- ejerce esfuerzo.

Cuando el trabajo físico supera un umbral, aparece una marca.

La marca todavía no posee significado.

Primero puede ser un simple rayón accidental.

Después otros organismos pueden aprender una asociación con ese patrón.

## 5. Dialectos reales

La métrica anterior podía llamar “dialecto” a un repertorio prácticamente individual.

Ahora un dialecto solo cuenta cuando:

- al menos tres organismos comparten un repertorio de varios símbolos;
- esos individuos están espacialmente próximos dentro de una zona social amplia.

Por eso el número de dialectos puede caer mucho al instalar v17.3.

Eso es intencional.

## 6. Microfísica tecnológica en turbo

A velocidades altas Rapier corporal completo sigue desactivándose para mantener rendimiento.

Sin embargo, las interacciones material-herramienta ya no se calculan con un único paso grande.

Empuje, rodamiento, abrasión, fractura y moldeado utilizan subpasos locales cortos incluso en modo turbo.

Esto reduce diferencias artificiales entre:

- observar tecnología a baja velocidad;
- evolucionarla durante pruebas rápidas.

El panel puede mostrar:

**turbo híbrido + microfísica**

Eso NO significa que todo el cuerpo esté usando Rapier a 100×. Significa que las interacciones tecnológicas locales conservan pasos físicos pequeños.

## 7. Qué observar ahora

Las métricas principales que interesan son:

- Población
- Individuos fértiles
- Balance poblacional
- Energía promedio
- Riesgo demográfico
- Procedimientos tecnológicos
- Agua almacenada
- Grupos sociales
- Relaciones recíprocas
- Intercambio regional

En diagnóstico avanzado también revisaremos:

- Marcas persistentes
- Símbolos externos compartidos
- Dialectos
- Física

## Objetivo esperado

No buscamos forzar números concretos, pero un mundo más equilibrado debería tender a mostrar:

- una fracción fértil mayor que en v17.2;
- energía promedio claramente por encima de la zona crítica;
- población menos envejecida;
- marcas físicas apareciendo ocasionalmente;
- menos “dialectos” falsamente individuales;
- tecnología menos dependiente de la velocidad de simulación.

## Compatibilidad

Puede abrir directamente un mundo guardado de v17.2.

No necesitas reiniciar.

Los organismos existentes adoptan las nuevas reglas de fertilidad, hambre y medición lingüística inmediatamente.

## GitHub Pages

Reemplaza:

- `index.html`
- `simulation.js`
- `README.md`

Haz **Commit changes** y después **Ctrl + F5**.

Debe aparecer:

**Motor cargado: v17.3.2**
