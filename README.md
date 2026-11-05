# IncidenciasTRANS & ClienteINCIDENCIAS

Sistema integral cliente-servidor de gestión de incidencias y soporte técnico diseñado específicamente para **entornos corporativos privados, redes locales (LAN) y subredes internas enrutadas**, sin ninguna dependencia de servicios en la nube ni conexión a internet externa.

---

## 📋 Características Principales

* **Arquitectura Cliente-Servidor Desacoplada**:
  * **Servidor (`IncidenciasTRANS`)**: Servicio HTTP ligero basado en Node.js y Express con base de datos embebida SQLite nativa (`node:sqlite`).
  * **Cliente (`ClienteINCIDENCIAS`)**: Interfaz web reactiva, moderna y ultra-rápida construida con React y Tailwind CSS, servida directamente por el servidor HTTP.
* **Base de Datos SQLite Ultraligera & WAL Mode**:
  * Almacenamiento local en un único fichero (`data/incidencias.db`).
  * Modo **WAL** (*Write-Ahead Logging*) y `PRAGMA synchronous = NORMAL` para soportar lecturas y escrituras simultáneas de múltiples terminales sin bloqueos de tabla.
  * Índices B-Tree optimizados para consultas en menos de 2 milisegundos.
* **Mínimo Consumo de Ancho de Banda (LAN / Wi-Fi)**:
  * **Compresión inteligente en cliente**: Al adjuntar capturas de pantalla o fotografías (desde el explorador, arrastrando o pegando con `Ctrl+V`), la imagen se reescala a un máximo de 1280px y se convierte a formato **WebP** antes de transmitirse. Reduce archivos pesados de 3–8 MB a solo **40–80 KB** (más del 95% de ahorro de ancho de banda).
  * Visor Lightbox integrado para ampliación a resolución completa y descarga.
* **Autenticación y Control de Acceso Diferenciado**:
  * **Usuarios estándar**: Acceso ágil sin contraseña. Si el usuario no existe, se **crea automáticamente** como usuario estándar activo usando el nombre y el departamento del formulario de acceso. Un administrador puede seguir editando, desactivando, cambiando de rol o eliminando esas cuentas.
  * **Aislamiento estricto de privacidad**: Los usuarios **únicamente pueden ver y seguir sus propias incidencias**. El servidor bloquea el acceso a cualquier ticket ajeno.
  * **Administradores**: Acceso seguro con usuario y contraseña (hash SHA-256). Disponen de la **Cola Global** para asignarse incidencias abiertas en 1 clic (*"⚡ Asignarme"*), actualizar estados y cambiar prioridades.
  * **Superadmin**: La cuenta `admin` creada en la primera instalación es el superadmin del sistema. Además de las funciones de administrador, es la única que puede vaciar la base de datos de incidencias o de usuarios.
* **Gestión de Usuarios (Panel de Administración)**:
  * Creación y gestión de nuevos usuarios estándar y nuevos administradores.
  * Modificación de datos, departamentos, activación/desactivación de cuentas y cambio de contraseñas.
  * La cuenta superadmin está protegida: no puede degradarse, desactivarse ni eliminarse.
* **Información del Equipo del Cliente**:
  * Cada inicio de sesión registra IP, MAC (si está en la misma red), nombre de equipo, usuario de Windows, dominio, navegador y fechas de conexión.
  * El **agente PowerShell** opcional envía de forma fiable el nombre del equipo, usuario de Windows, dominio, MAC e IP. Se puede ejecutar una vez o instalar al iniciar sesión.
  * Los administradores pueden consultar las sesiones y los equipos registrados desde el botón **"Equipos"**, y ver el equipo del solicitante dentro de cada incidencia.
* **Notificaciones en Tiempo Real (HTTP/HTTPS por IP)**:
  * Sistema de avisos con campana, insignias numéricas y ventanas emergentes (*Toast*) instantáneas:
    * **Para el Administrador**: Aviso inmediato cuando un usuario abre una nueva incidencia o comenta en un hilo.
    * **Para el Usuario**: Aviso cuando un administrador toma su incidencia, cambia el estado o escribe una respuesta técnica.
* **Hilos de Conversación Detallados**:
  * Diálogo bidireccional entre el usuario creador y el equipo de soporte técnico con identificación visual de roles y notas automáticas de auditoría del sistema.

---

## 🖥️ Requisitos del Sistema

* **Sistema Operativo Recomendado**: **Ubuntu Server 24.04 LTS** o **Debian 12 (Bookworm)** (también compatible con Rocky Linux, AlmaLinux, RHEL y Windows Server).
* **Entorno de Ejecución**: **Node.js v22.0.0 LTS o superior** (imprescindible para el motor nativo `node:sqlite`).
* **Hardware Mínimo**:
  * Procesador: 1 vCPU / CPU x86_64 o ARM64.
  * Memoria RAM: 512 MB (en reposo consume menos de 150 MB).
  * Almacenamiento: 1 GB libre (la base de datos SQLite ocupa solo unos pocos megabytes).

---

## 🚀 Instalación y Despliegue en Servidor Físico

### 1. Instalar Node.js 22 LTS en el Servidor (Ubuntu / Debian)

```bash
# Descargar e instalar repositorio oficial de Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# Verificar versión instalada (debe ser v22.x.x o superior):
node -v
npm -v
```

### 2. Clonar el Repositorio de GitHub

```bash
# Clonar en la ruta recomendada para servicios en Linux
sudo git clone https://github.com/TU_USUARIO/TU_REPOSITORIO.git /opt/incidencias-trans

# Dar permisos al usuario del sistema
sudo chown -R $USER:$USER /opt/incidencias-trans
cd /opt/incidencias-trans
```

### 3. Instalar Dependencias y Compilar

```bash
# Instalar módulos de node
npm install

# Compilar frontend (React) y backend (servidor Node en dist/server.js)
npm run build
```

### 4. Prueba Rápida de Ejecución

```bash
npm start
```

Verás la salida de confirmación en la consola:
```text
[IncidenciasTRANS] Servidor HTTP activo en http://0.0.0.0:3000
[IncidenciasTRANS] Base de datos SQLite activa con modo WAL
[ClienteINCIDENCIAS] Interfaz web lista
```

Pulsa `Ctrl + C` para detener la prueba antes de configurarlo como servicio permanente.

---

## ⚙️ Configuración como Servicio Permanente en Linux (`systemd`)

Para que el servidor se ejecute 24/7 en segundo plano y **arranque de forma automática cada vez que se encienda la máquina física**:

1. Crear el archivo de unidad `systemd`:
```bash
sudo nano /etc/systemd/system/incidencias-trans.service
```

2. Pegar el siguiente contenido:
```ini
[Unit]
Description=Servidor HTTP IncidenciasTRANS (Red Local Privada)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/incidencias-trans
ExecStart=/usr/bin/node /opt/incidencias-trans/dist/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

3. Recargar el demonio de `systemd`, habilitar el servicio e iniciarlo:
```bash
sudo systemctl daemon-reload
sudo systemctl enable incidencias-trans
sudo systemctl start incidencias-trans
```

4. Comprobar que está activo y funcionando:
```bash
sudo systemctl status incidencias-trans
```

5. Abrir el puerto en el cortafuegos de Linux (si usas `ufw`):
```bash
sudo ufw allow 3000/tcp
```

---

## 🔑 Credenciales Iniciales de Instalación

Al arrancar por primera vez, la base de datos se inicializa automáticamente en `./data/incidencias.db` con los siguientes datos:

| Rol | Usuario | Contraseña | Propósito |
| :--- | :--- | :--- | :--- |
| **Superadmin** | `admin` | `admin123` | Control total, gestión de usuarios, borrado de datos y mantenimiento. |
| **Usuario muestra 1** | `luis` | *(Sin contraseña)* | Pruebas de puesto de Logística y Transporte. |
| **Usuario muestra 2** | `maria` | *(Sin contraseña)* | Pruebas de puesto de Administración. |

> 💡 **Nota de seguridad**: Tras el primer acceso como `admin`, accede al apartado **"Usuarios"** para crear las cuentas de tu equipo o modificar las contraseñas. Cambia la contraseña por defecto del superadmin.

> 💡 **Alta automática**: cualquier persona puede entrar en la pestaña **Usuario** con un identificador nuevo; se creará una cuenta estándar activa. El administrador puede desactivarla o eliminarla después.

---

## 🌐 Acceso de los Clientes desde la Red Local

Cualquier ordenador, tablet o terminal conectado a la red local corporativa puede acceder abriendo el navegador web e introduciendo la dirección IP del servidor:

```text
http://<IP_LOCAL_DEL_SERVIDOR>:3000
```
*Ejemplo:* `http://192.168.1.100:3000` o `http://10.0.0.25:3000`

---

## 🖥️ Agente de Datos del Equipo (Windows)

El navegador no puede leer por sí solo la MAC, el usuario de Windows ni el dominio. Para capturarlos de forma fiable, el servidor pone a disposición el agente `IncidenciasTRANS-Agent.ps1`.

1. Entra como administrador y pulsa **Equipos → Descargar agente**.
2. Copia el fichero al PC del usuario y ejecútalo una vez:

```powershell
powershell -ExecutionPolicy Bypass -File .\IncidenciasTRANS-Agent.ps1
```

3. Para que se ejecute automáticamente en cada inicio de sesión de Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\IncidenciasTRANS-Agent.ps1 -Install
```

El agente envía al servidor el nombre del equipo, IP, MAC, usuario de Windows, dominio y versión de Windows. El servidor lo asocia a la sesión del usuario por IP y enriquece también las incidencias ya creadas desde ese equipo. Para desplegarlo masivamente se puede distribuir el `.ps1` mediante GPO o una tarea programada.

---

## 🧹 Limpieza de la Base de Datos (solo superadmin)

La cuenta `admin` (superadmin) dispone de una **Zona peligrosa** dentro de **Usuarios** con dos acciones independientes:

* **Vaciar incidencias**: elimina incidencias, mensajes, adjuntos y notificaciones, conservando los usuarios.
* **Vaciar usuarios**: elimina todos los usuarios excepto el superadmin actual y, por defecto, también sus incidencias y conversaciones. Las sesiones de los usuarios eliminados dejan de ser válidas.

Ambas acciones exigen escribir `BORRAR` para confirmar. **Realiza una copia de seguridad antes de usarlas.**

---

## 🔄 Configuración Opcional con Proxy Inverso (Nginx en Puerto 80)

Si deseas que los usuarios accedan directamente por el puerto estándar HTTP (puerto 80) o con un nombre DNS interno (ej. `http://incidencias.empresa.local`):

1. Instalar Nginx:
```bash
sudo apt-get install -y nginx
```

2. Crear configuración de sitio:
```bash
sudo nano /etc/nginx/sites-available/incidencias
```

```nginx
server {
    listen 80;
    server_name incidencias.empresa.local 192.168.1.100;

    # Permitir únicamente accesos desde subredes internas de la empresa
    allow 192.168.0.0/16;
    allow 10.0.0.0/8;
    allow 127.0.0.1;
    deny all;

    client_max_body_size 12M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

3. Activar el sitio y reiniciar Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/incidencias /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## 💾 Copias de Seguridad de la Base de Datos (Backup)

Al tratarse de SQLite en modo WAL, puedes realizar **copias de seguridad en caliente sin necesidad de detener el servidor**:

```bash
# Backup consistente sin bloqueos:
sqlite3 /opt/incidencias-trans/data/incidencias.db ".backup '/copias/incidencias_$(date +%Y%m%d_%H%M%S).db'"
```

Puedes programar esta línea en el `crontab` de Linux para que se ejecute a diario de forma desatendida:
```bash
# Ejemplo: copia todos los días a las 23:00
0 23 * * * sqlite3 /opt/incidencias-trans/data/incidencias.db ".backup '/copias/incidencias_\$(date +\%Y\%m\%d).db'"
```

---

## 🛠️ Comandos de Desarrollo y Mantenimiento

* `npm run dev`: Inicia el servidor de desarrollo Vite con la API de IncidenciasTRANS integrada.
* `npm run build`: Compila el frontend a producción y genera el bundle del servidor Node (`dist/server.js`).
* `npm start`: Inicia el servidor de producción compilado (`node dist/server.js`).
* `npm run lint`: Valida tipos TypeScript en todo el proyecto.

---

## 📄 Licencia

Software desarrollado para uso interno corporativo bajo licencia Apache-2.0.
