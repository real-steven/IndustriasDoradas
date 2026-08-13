# Guía para ejecutar el sistema

Esta guía permite levantar la API, el portal web y la aplicación de escritorio
desde PowerShell o desde las terminales integradas de Visual Studio Code.

## 1. Abrir el proyecto

Abre una terminal de PowerShell y entra en la raíz del repositorio:

```powershell
cd C:\Users\titen\IndustriasDoradas
```

Todos los comandos de esta guía se ejecutan desde esa carpeta.

## 2. Preparación inicial

La primera vez que descargues el proyecto, o después de recibir cambios en sus
dependencias, ejecuta:

```powershell
pnpm.cmd install --frozen-lockfile
dotnet restore apps/desktop/IndustriasDoradas.Desktop.slnx
```

El primer comando instala las dependencias de la API y del portal web. El
segundo restaura las dependencias de la aplicación WPF.

## 3. Levantar todo el sistema

Abre tres terminales en Visual Studio Code mediante **Terminal > New Terminal**.
Cada componente debe permanecer ejecutándose en su propia terminal.

### Terminal 1: API NestJS

```powershell
cd C:\Users\titen\IndustriasDoradas
$env:NODE_ENV = "development"
$env:PORT = "3000"
pnpm.cmd --filter @industrias-doradas/api start:dev
```

Comprueba la API abriendo esta dirección en el navegador:

```text
http://localhost:3000/api/v1/health
```

Debe responder con un JSON parecido a este:

```json
{
  "status": "ok",
  "service": "industrias-doradas-api",
  "timestamp": "2026-08-13T12:00:00.000Z"
}
```

### Terminal 2: portal web React

La API debe permanecer activa en la terminal 1.

```powershell
cd C:\Users\titen\IndustriasDoradas
pnpm.cmd --filter @industrias-doradas/web dev
```

Abre el portal en:

```text
http://localhost:5173/estado
```

Cuando la API está activa, la página muestra **API disponible**. Si detienes la
API y pulsas **Actualizar estado**, muestra **API no disponible**.

### Terminal 3: aplicación desktop WPF

```powershell
cd C:\Users\titen\IndustriasDoradas
$env:DOTNET_ENVIRONMENT = "Development"
dotnet run --project apps/desktop/src/IndustriasDoradas.Desktop/IndustriasDoradas.Desktop.csproj
```

Se abrirá la ventana **Industrias Doradas**. En el menú lateral selecciona
**Diagnóstico** para consultar el estado de la API.

La aplicación desktop también puede abrirse sin la API. En ese caso mostrará
**API no disponible**, pero permanecerá funcionando y permitirá reintentar.

## 4. Abrir desktop desde Visual Studio

También puedes ejecutar la aplicación WPF mediante Visual Studio:

1. Abre Visual Studio.
2. Selecciona **Open a project or solution**.
3. Abre este archivo:

   ```text
   C:\Users\titen\IndustriasDoradas\apps\desktop\IndustriasDoradas.Desktop.slnx
   ```

4. Establece `IndustriasDoradas.Desktop` como proyecto de inicio.
5. Presiona `F5` para ejecutar con depuración o `Ctrl + F5` sin depuración.

Si deseas usar la configuración de desarrollo desde Visual Studio, agrega la
variable `DOTNET_ENVIRONMENT=Development` al perfil de ejecución. Sin esa
variable se utiliza la configuración base, que también apunta a la API local en
el puerto 3000.

## 5. Ejecutar un componente por separado

### Solo la API

```powershell
cd C:\Users\titen\IndustriasDoradas
$env:NODE_ENV = "development"
$env:PORT = "3000"
pnpm.cmd --filter @industrias-doradas/api start:dev
```

### Solo el portal web

```powershell
cd C:\Users\titen\IndustriasDoradas
pnpm.cmd --filter @industrias-doradas/web dev
```

El portal abre aunque la API esté apagada, pero mostrará que no hay conexión.

### Solo la aplicación desktop

```powershell
cd C:\Users\titen\IndustriasDoradas
$env:DOTNET_ENVIRONMENT = "Development"
dotnet run --project apps/desktop/src/IndustriasDoradas.Desktop/IndustriasDoradas.Desktop.csproj
```

## 6. Ejecutar versiones compiladas

### API compilada

```powershell
cd C:\Users\titen\IndustriasDoradas
pnpm.cmd --filter @industrias-doradas/api build
$env:NODE_ENV = "production"
$env:PORT = "3000"
pnpm.cmd --filter @industrias-doradas/api start:prod
```

### Portal web compilado en modo de vista previa

```powershell
cd C:\Users\titen\IndustriasDoradas
pnpm.cmd --filter @industrias-doradas/web build
pnpm.cmd --filter @industrias-doradas/web preview
```

Vite mostrará en la terminal la dirección local de la vista previa. Este modo
sirve para revisar el build; el proxy local de desarrollo está pensado para el
comando `dev`.

### Desktop compilado

```powershell
cd C:\Users\titen\IndustriasDoradas
dotnet build apps/desktop/IndustriasDoradas.Desktop.slnx
$env:DOTNET_ENVIRONMENT = "Development"
dotnet run --project apps/desktop/src/IndustriasDoradas.Desktop/IndustriasDoradas.Desktop.csproj --no-build
```

## 7. Verificar los tres componentes

### API

```powershell
pnpm.cmd --filter @industrias-doradas/api lint
pnpm.cmd --filter @industrias-doradas/api build
pnpm.cmd --filter @industrias-doradas/api test
pnpm.cmd --filter @industrias-doradas/api test:e2e
```

### Web

```powershell
pnpm.cmd --filter @industrias-doradas/web lint
pnpm.cmd --filter @industrias-doradas/web build
pnpm.cmd --filter @industrias-doradas/web test
```

### Desktop

```powershell
dotnet restore apps/desktop/IndustriasDoradas.Desktop.slnx
dotnet build apps/desktop/IndustriasDoradas.Desktop.slnx --no-restore
dotnet test apps/desktop/IndustriasDoradas.Desktop.slnx --no-build
```

## 8. Detener el sistema

Para detener la API o el portal web, entra en su terminal y presiona:

```text
Ctrl + C
```

Para detener desktop, cierra normalmente la ventana **Industrias Doradas**. Si
la ejecutaste desde una terminal y la ventana no responde, vuelve a esa terminal
y presiona `Ctrl + C`.

## 9. Puertos utilizados

| Componente | Dirección |
| --- | --- |
| API | `http://localhost:3000` |
| Health de la API | `http://localhost:3000/api/v1/health` |
| Portal web | `http://localhost:5173` |
| Estado del portal | `http://localhost:5173/estado` |

Si un puerto ya está siendo utilizado, detén la ejecución anterior con
`Ctrl + C` antes de volver a iniciar el componente.
