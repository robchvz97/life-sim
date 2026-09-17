# Life Sim v17.1.3 — Cultural Breakthrough / Water Access Patch

Esta revisión corrige el cuello de botella observado en v17.1: existían recipientes potenciales, pero casi nunca almacenaban agua.

## Qué estaba ocurriendo

Un recipiente solo se llenaba si su posición entraba físicamente dentro del estanque.

Los organismos, mientras tanto, aprendían que entrar al agua tenía un coste energético importante. Eso hacía muy improbable mantener un objeto con capacidad dentro del estanque durante suficiente tiempo.

Por tanto:

- había objetos con capacidad;
- había procedimientos tecnológicos;
- pero `Agua almacenada` seguía en cero.

## Cambios

### Interacción desde la orilla

Ahora un organismo puede sumergir físicamente el objeto que lleva si su alcance corporal llega al borde del estanque.

El cuerpo completo no necesita entrar.

Esto no crea una acción semántica `llenar recipiente`.

Sigue dependiendo de:

- proximidad real al agua;
- alcance corporal;
- tener un objeto con capacidad;
- manipulación neural del objeto.

### Llenado más rápido

Un objeto realmente sumergido se llena a una velocidad más razonable.

Antes podía necesitar permanecer mucho tiempo en el agua, haciendo que los contactos breves fueran prácticamente inútiles.

### Coste del agua

Se redujo el castigo metabólico fijo por estar dentro del estanque.

Ahora el coste se comporta más como resistencia al movimiento:

- moverse dentro del agua cuesta más;
- quedarse casi quieto cuesta mucho menos que antes.

### Percepción de la orilla

El canal neural que antes indicaba únicamente `dentro / fuera del agua` ahora cambia gradualmente al aproximarse al estanque.

Esto da al cerebro información antes de entrar y permite aprender secuencias relacionadas con la orilla.

### Peso real del agua

Se mantiene el cambio de v17.1:

un objeto con agua pesa más y afecta presión, transporte, posibilidad de levantarlo y gasto energético.

## Diagnóstico nuevo

El panel añade:

- `Contactos recipiente-agua`
- `Máx. agua en un objeto`

Si `Contactos recipiente-agua` aumenta pero `Agua almacenada` vuelve a cero, entonces el problema estaría en pérdida/uso posterior del líquido.

Si ambos permanecen en cero después de muchas generaciones, sabremos que el cuello de botella sigue siendo llegar a la orilla llevando un recipiente.

## Compatibilidad

Puede cargar el mismo mundo guardado de v17.1 / v17.0.

No es necesario reiniciar.

## GitHub Pages

Reemplaza:

- `index.html`
- `simulation.js`
- `README.md`

Haz **Commit changes** y después **Ctrl + F5**.

Debe aparecer:

**Motor cargado: v17.1.3**
