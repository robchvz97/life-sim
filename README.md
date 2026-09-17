# Life Sim v17.7 — Body Plan Evolution & Limb Specialization

Esta versión abre una ruta para que aparezcan cuerpos más organizados y potencialmente humanoides, pero **no programa una transformación hacia humanos**.

## Principio

No existe:

`humanoid += generación`

Tampoco existen genes llamados:

- brazo;
- pierna;
- mano;
- pie.

En su lugar aparecen propiedades físicas heredables que pueden ser seleccionadas si mejoran supervivencia y reproducción.

## Nuevos rasgos heredables

### Postura axial

`axialPosture`

Controla cuánto tiende el eje principal del cuerpo a pasar de horizontal a vertical.

Valores bajos producen cuerpos alargados/horizontales.

Valores altos apilan más los segmentos corporalmente en vertical.

### Diferenciación de extremidades

`limbDifferentiation`

Permite que distintas parejas de extremidades diverjan funcionalmente.

Con valores bajos, todas tienden a ser similares.

Con valores altos, unas pueden favorecer soporte/locomoción y otras manipulación.

### Sesgo manipulador

`manipulatorBias`

Aumenta el potencial de las extremidades cercanas a la región sensorial para alcanzar y manipular.

### Sesgo de soporte

`supportBias`

Aumenta el potencial de extremidades situadas hacia la región opuesta del eje para soportar peso y propulsar.

### Destreza distal

`distalDexterity`

Mejora el valor mecánico de los órganos terminales en tareas de agarre y alcance.

### Superficie de soporte

`supportFoot`

Puede producir órganos terminales más extendidos cuando una extremidad se especializa en soporte.

### Separación de la región sensorial

`headSeparation`

Permite que la masa donde se concentran sensores se distancie más del tronco.

No implica una cabeza humana.

## Especialización por uso

Cada pareja de extremidades acumula tres señales de desarrollo:

- soporte;
- locomoción;
- manipulación.

Una extremidad que toca el suelo y genera movimiento desarrolla más su función de soporte.

Una que está anatómicamente favorecida y participa durante manipulación aumenta su especialización manipuladora.

La anatomía heredada pone límites y predisposiciones; la experiencia modifica el desarrollo individual.

## Consecuencias funcionales

La especialización no es solo visual.

Una buena especialización manipuladora puede mejorar ligeramente:

- agarre;
- alcance;
- capacidad para mover materiales;
- trabajo colectivo sobre objetos.

Una buena especialización de soporte puede mejorar:

- propulsión;
- eficiencia motora.

Tener más extremidades también tiene un pequeño coste metabólico de tejido.

Por tanto no siempre conviene tener el máximo número posible.

## Apariencia

El eje corporal puede volverse progresivamente más vertical.

En un cuerpo con varias parejas, las extremidades superiores e inferiores pueden adoptar proporciones diferentes.

Los extremos de las extremidades poseen un órgano distal genérico.

Según función puede hacerse:

- más ancho/compacto para manipulación;
- más extendido para soporte.

No tiene dedos humanos ni pies humanos prediseñados.

## Posible convergencia humanoide

Una combinación como:

- eje relativamente vertical;
- dos parejas principales de extremidades;
- pareja superior especializada en manipulación;
- pareja inferior especializada en soporte;
- región sensorial separada;

puede resultar visualmente humanoide sin ser humana.

Pero también pueden evolucionar:

- seis extremidades;
- cuerpos horizontales;
- múltiples pares especializados;
- formas bajas;
- formas con poca manipulación.

## Compatibilidad

Los mundos v17.6.5 cargan directamente.

Los genomas antiguos reciben valores iniciales moderados para los nuevos genes; a partir de ahí mutan y recombinan normalmente.

No necesitas reiniciar.

## Métricas nuevas

En Diagnóstico avanzado:

- Postura axial prom.
- Diferenciación de extremidades
- Especialización manipuladora
- Especialización de soporte

También puede aparecer en Historia:

**Plan corporal altamente diferenciado**

Esto es un criterio morfológico, no una afirmación de inteligencia ni de humanidad.

## Qué observar

No esperes un cambio grande en tres generaciones.

Lo importante es comparar decenas de generaciones y ver si:

1. la postura axial promedio cambia;
2. la diferenciación de extremidades cambia;
3. manipulación y soporte divergen;
4. determinadas formas dejan más descendencia.

## GitHub Pages

Reemplaza:

- `index.html`
- `simulation.js`
- `README.md`

Haz **Commit changes** y después **Ctrl + F5**.

Debe aparecer:

**Motor cargado: v17.7.1**
