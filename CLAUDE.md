# Contexto del proyecto

## Qué es

Web de predicciones entre un grupo de amigos que discuten sobre el ritmo de progreso de la IA. El objetivo real: dejar registro fechado e inmutable de lo que cada uno predice, para que no se pueda reescribir la postura a posteriori.

## Stack

JS plano sin build. `index.html`, `app.js`, `styles.css` en la raíz. `supabase-js` por CDN con import de módulo ES. Supabase (Postgres + RLS + realtime) como backend. Vercel para desplegar, sin build step.

No introducir React, Vite, TypeScript ni bundler. La ausencia de build es una decisión deliberada: el proyecto tiene que seguir funcionando dentro de muchos años sin mantenimiento de dependencias.

## Convenciones

- Código en inglés: nombres de archivo, variables, funciones, clases CSS.
- Texto de la interfaz en español.
- Sin comentarios en el código.
- Sin `localStorage` para datos del registro; solo para la sesión.

## Modelo de datos

`players`, `questions`, `answers`, `reactions`, `flags`. El esquema completo está en `schema.sql`.

Las escrituras van por funciones `security definer` que verifican el PIN. Las tablas no tienen políticas de `update` ni `delete`: las respuestas son inmutables por diseño y esa es la propiedad central del proyecto. No añadir edición ni borrado de respuestas.

## Decisiones de producto ya tomadas

- Dos tipos de pregunta: `yesno` con fecha límite fija, y `year` (¿en qué año?) con opciones 2027 / 2028 / 2031 / 2036 / 2046 / nunca.
- Cada respuesta lleva: predicción, apuesta, comentario y "¿qué te haría cambiar de opinión?".
- La apuesta se muestra siempre como frase completa ("Pongo 10€ a que pasa antes de que acabe 2031, contra 1€ de quien diga que no"), nunca como notación de cuotas. El deslizador recorre `RATIOS`, de 1:20 a 100:1. La probabilidad implícita se muestra en pequeño.
- Se puede responder muchas veces. Cada respuesta es una fila nueva; nunca se sobrescribe. La visualización "goalpost" dibuja la secuencia de respuestas de cada jugador sobre el eje de años, con el último punto relleno.
- Las respuestas de los demás son siempre visibles antes de responder. Es deliberado.
- Las apuestas son simbólicas, en euros de mentira.
- Cualquiera puede proponer preguntas; entran con estado `proposed` y las aprueba el administrador.
- Administrador: el jugador llamado `Sheriff`. Aprueba propuestas y marca preguntas como resueltas.
- Botón "no es evaluable" por pregunta, con recuento visible. Es una válvula de escape legítima para las objeciones sobre el criterio de resolución.
- Reacciones con emoji, mostrando el nombre de quien reacciona.
- Login por nombre + PIN de 4 cifras, fijado la primera vez. Es un candado de cortesía, no seguridad; el grupo lo sabe.

## Pendiente

El banco de preguntas está sin terminar: en `schema.sql` solo hay cinco de ejemplo, una por sección. Falta escribir el resto. Regla para cada pregunta nueva: si el criterio de resolución no cabe en una frase que diga quién lo declara y con qué evidencia, la pregunta no sirve y se descarta.
