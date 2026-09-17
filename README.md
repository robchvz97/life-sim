# Life Sim v17.7.2 — Natural Water Rendering

Esta revisión corrige el estanque/agua que podía verse como una gran masa negra.

## Causa

El agua se dibujaba con muchos círculos transparentes instanciados. En zonas con muchas celdas húmedas esos círculos se superponían, y el alpha se acumulaba hasta producir manchas casi negras.

## Corrección

El agua ahora se genera como una sola geometría de superficie formada por celdas húmedas adyacentes.

Cada celda aporta un quad sin superponerse con sus vecinas, por lo que ya no existe acumulación de transparencia.

La hidrología no cambia: lluvia, infiltración, escurrimiento, estanque permanente y agua superficial siguen funcionando igual.

## Apariencia

- agua azul/verde más clara;
- menor opacidad;
- material físico con brillo/clearcoat suave;
- estanque permanente más estable visualmente;
- charcos temporales siguen la altura del terreno.

## Compatibilidad

Carga directamente mundos v17.7 / v17.6.x. No requiere reiniciar.

## GitHub Pages

Reemplaza `index.html`, `simulation.js` y `README.md`, haz Commit changes y luego Ctrl + F5.

Debe aparecer **Motor cargado: v17.7.2**.
