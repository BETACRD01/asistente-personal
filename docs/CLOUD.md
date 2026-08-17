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
- **Dominio** para la API: `agentrelay.duckdns.org` (certificado TLS vía DuckDNS / Let's Encrypt).

## Notas

- No subir claves ni `.env` al repositorio.
- Guardar los secrets en el gestor de secrets de GitHub o del proveedor.
- El hub solo enruta el **terminal remoto** (WebSocket); el cliente conecta por
  `wss://agentrelay.duckdns.org/ws/term?token=<DEVICE_TOKEN>&device=<DEVICE_TOKEN>`.