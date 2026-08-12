# La portería

Registro de predicciones entre amigos. Las respuestas no se editan ni se borran: cada una queda con su fecha, y se ve cómo cambia la postura de cada uno con el tiempo.

## Puesta en marcha

1. Crea el repo en GitHub y mete estos cuatro archivos en la raíz.
2. En Supabase, abre el SQL Editor y ejecuta `schema.sql` entero.
3. En Supabase, Settings → API: copia la Project URL y la clave `anon`.
4. Pégalas arriba del todo en `app.js`, en `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
5. En Vercel, importa el repo. No hay build: framework preset "Other", output directory la raíz.
6. Abre la web, elige tu nombre y fija tu PIN.

La clave `anon` es pública por diseño; lo que protege la base de datos son las políticas RLS y las funciones de `schema.sql`. Nadie puede editar ni borrar respuestas, tampoco tú.

## Administración

El administrador es el jugador llamado `Sheriff`: aprueba las preguntas propuestas y marca las resueltas. Para cambiarlo, edita el nombre en `set_question_status` y en la constante `isAdmin` de `app.js`.

## Copia de seguridad

Supabase → Table Editor → cada tabla → Export to CSV. Vale la pena hacerlo de vez en cuando y dejarlo en el repo.
