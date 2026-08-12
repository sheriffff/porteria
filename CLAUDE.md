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

- Tres tipos de pregunta: `yesno` (con fecha límite), `year` (¿en qué año?) y `gap` (¿cuántos años entre dos hitos?). Los tipos numéricos (`year`, `gap`) se responden con un campo para escribir el número y un botón para el extremo (`>2050` / `>20`); la escala de cada uno vive en `SCALES` y el goalpost los dibuja sobre un eje continuo. El criterio de resolución se guarda pero no se muestra en la tarjeta.
- Sección `Generalidad`: preguntas sobre si resolver un problema arrastra a los demás — huecos en años entre hitos. Recogen el debate sobre si la superinteligencia generaliza o cada problema necesita su marco.
- Las preguntas se agrupan en dos pestañas (`TABS`): sí/no (`yesno`) y años (todo lo demás: `year` y `gap` juntos). Sin etiqueta de sección en la tarjeta.
- Cada respuesta lleva: predicción, apuesta (solo en `yesno`) y comentario.
- Solo las preguntas `yesno` llevan apuesta de dinero; `year` y `gap` solo registran la predicción, sin importe. En `yesno` la apuesta se muestra como frase completa ("Pongo 10€ a que SÍ antes del 2030, contra 1€ de quien diga que no"), nunca como cuotas. El importe se elige con botones (`AMOUNTS`: 1, 2, 5, 10€) o escribiendo una cantidad; siempre contra 1€. La columna `ratio` guarda ese importe. La probabilidad implícita se muestra en pequeño.
- Se puede responder muchas veces. Cada respuesta es una fila nueva; nunca se sobrescribe. La visualización "goalpost" dibuja la secuencia de respuestas de cada jugador sobre el eje de años, con el último punto relleno.
- Las respuestas de los demás son siempre visibles antes de responder. Es deliberado.
- Las apuestas son simbólicas, en euros de mentira.
- Cualquiera puede proponer preguntas; entran con estado `proposed` y las aprueba el administrador.
- Administrador: el jugador llamado `Sheriff`. Tiene un panel de admin (solo visible para él) que lista las propuestas pendientes y las aprueba. Las propuestas (`status = 'proposed'`) no salen en la lista normal, solo en el panel. Resolver preguntas queda pendiente para ese mismo panel.
- Dos niveles: la tarjeta muestra solo el goalpost (resumen limpio) y un enlace "Ver detalle"; al abrirlo aparece el detalle por jugador (predicción, % en `yesno`, comentario y reacciones), cada uno en una línea.
- Reacciones con emoji en línea, mostrando el nombre de quien reacciona; un botón `＋` abre el selector de emojis.
- Botón "Invitar" en la barra: usa `navigator.share` en móvil y copia el enlace al portapapeles si no está disponible.
- Los enunciados van al grano: predicen que algo se resuelve o pasa, sin exigir en el criterio que lo haya hecho una IA. Si un humano lo resuelve, cuenta igual.
- Login por nombre + PIN de 4 cifras, fijado la primera vez. Es un candado de cortesía, no seguridad; el grupo lo sabe.

## Pendiente

El banco de preguntas está sin terminar: en `schema.sql` solo hay cinco de ejemplo, una por sección. Falta escribir el resto. Regla para cada pregunta nueva: si el criterio de resolución no cabe en una frase que diga quién lo declara y con qué evidencia, la pregunta no sirve y se descarta.
