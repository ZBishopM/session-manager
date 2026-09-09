# Consola

Usa nushell para los comandos locales: `nu -c 'pnpm test'`.
Si nu no está disponible, para y pregunta.

Dentro del VPS la consola es bash — allí no hay nu. Los bloques de la
documentación dicen cuál de las dos usa cada uno: `nu` para tu máquina, `bash`
para el servidor.

En nu, `;` encadena y se detiene si un comando falla, así que ocupa el lugar
de `&&`. Las líneas seguidas de un bloque se comportan igual.

Antes de aceptar un cambio, sigue `docs/VERIFICATION.md`.
Para orientarte en el repo, empieza por `docs/HANDOFF.md`.
