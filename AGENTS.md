# Intercambio de archivos con el celular (Termux)

El usuario se conecta a esta Mac por SSH desde su celular (Termux) a través de un
túnel. Los archivos viajan con `scp`/`sftp` entre el celular y estas carpetas:

- **Entrada (celular → Mac): `~/inbox/`**
  Archivos que el usuario envía desde el celular para que el agente los procese
  (imágenes, audio, PDF, documentos, etc.). Si el usuario pide "analiza esta
  imagen" o dice que envió un archivo desde el celular, búscalo en `~/inbox/`.

- **Salida (Mac → celular): `~/outbox/`**
  Entregables que el agente genera para el usuario (imágenes procesadas, PDFs,
  audios, documentos, capturas, etc.). Guarda **siempre** los entregables ahí y
  avísale al usuario que ya están listos para que los baje con `outbox-pull`.

## Reglas

- Si el usuario menciona un archivo que viene del celular, asume que está en `~/inbox/`.
- Todo archivo generado para devolver al usuario se escribe en `~/outbox/` con un nombre claro.
- No subas archivos a ningún repositorio remoto sin permiso explícito del usuario.
- Este repositorio es **público** en GitHub: nunca escribas tokens, contraseñas
  ni `.env` dentro del repo.