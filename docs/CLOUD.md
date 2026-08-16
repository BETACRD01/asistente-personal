# Cloud Compartido

## Cuenta principal

| Campo | Valor |
|-------|-------|
| **Cuenta de nube compartida** | `wd1501074@gmail.com` |
| Proyecto GCP (UpminaVid) | `delivery-109f4` |

> Esta cuenta (`wd1501074@gmail.com`) es la que tiene permisos de acceso a la VM
> `free-ubuntu-vm` (proyecto `delivery-109f4`). Usar esta cuenta para crear y
> gestionar los recursos de este proyecto.

## Recursos a crear

- **VPS / VM** en GCP (o el proveedor que se elija) con Ubuntu.
- **Dominio** para la API: `api.tudominio.com` (pendiente de elegir).
- **Redis** (instancia gestionada o contenedor en el VPS).
- **Certificado TLS** con Let's Encrypt / Certbot.

## Notas

- No subir claves ni `.env` al repositorio.
- Guardar los secrets en el gestor de secrets de GitHub o del proveedor.
- La app móvil apuntará a `https://api.tudominio.com` y `wss://api.tudominio.com/ws/app`.