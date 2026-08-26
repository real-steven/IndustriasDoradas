# Aplicación de escritorio WPF

Estación de planta construida con WPF y .NET 10. Incluye login Supabase Auth,
Modo Operación, elevación temporal de jefe de planta y registro/corrección local
de cajuelas para una línea piloto; aún no incluye sincronización, asistencia ni
biometría.

## Organización

El ejecutable usa carpetas y namespaces para separar responsabilidades sin
crear bibliotecas vacías:

| Carpeta | Responsabilidad |
| --- | --- |
| `Presentation` | Ventanas, vistas XAML y ViewModels MVVM. |
| `Application` | Contratos que definen los casos técnicos de la aplicación. |
| `Domain` | Modelo independiente del resultado de health. |
| `Infrastructure` | Clientes HTTP, almacenamiento SQLite y repositorios locales. |
| `Configuration` | Opciones validadas de conexión. |

## Ejecutar desde CLI

Inicia primero la API en el puerto 3000. Después, desde la raíz del repositorio:

```powershell
$env:DOTNET_ENVIRONMENT = "Development"
dotnet run --project apps/desktop/src/IndustriasDoradas.Desktop/IndustriasDoradas.Desktop.csproj
```

La aplicación inicia aunque la API no esté disponible: la pantalla de
diagnóstico muestra el error y permite actualizar nuevamente.

## Ejecutar desde Visual Studio

1. Abre `apps/desktop/IndustriasDoradas.Desktop.slnx`.
2. Establece `IndustriasDoradas.Desktop` como proyecto de inicio.
3. Selecciona la configuración `Debug`.
4. Presiona `F5`.

Visual Studio permite ejecutar las pruebas desde **Test > Test Explorer**.

## Configuración por ambiente

El Generic Host carga `appsettings.json`, después
`appsettings.{DOTNET_ENVIRONMENT}.json` y `appsettings.Local.json`. Copia el
ejemplo local y agrega únicamente URL/clave publicable de Supabase e ID de
estación; nunca uses la clave secreta del API. La configuración base consulta
`http://127.0.0.1:3000/`; `Development` reduce el timeout a dos segundos para
dar retroalimentación rápida. Ambas opciones se validan al iniciar.

Tokens, refresh token y verificador offline se guardan cifrados con DPAPI para
el usuario Windows actual. La autorización offline vence a las 24 horas; al
recuperar red se revalida y una revocación invalida el modo privilegiado sin
borrar eventos pendientes. La fotografía futura está desacoplada y hoy se
registra únicamente como evidencia ausente.

`OperationInput` configura controladores por identificador, tipo de adaptador,
línea asignada y señales. El teclado inicial usa `1`, `+`, flechas, `Enter`, `R`
y `Escape`; puede cambiarse en configuración sin modificar el caso de uso. La
aplicación conserva el origen de clic/teclado/controlador en el sobre Outbox.
El sensor automático no está incluido.

## Verificar

```powershell
dotnet restore apps/desktop/IndustriasDoradas.Desktop.slnx
dotnet build apps/desktop/IndustriasDoradas.Desktop.slnx --no-restore
dotnet test apps/desktop/IndustriasDoradas.Desktop.slnx --no-build
```

## Dependencias

| Paquete | Propósito |
| --- | --- |
| `CommunityToolkit.Mvvm` | `ObservableObject` y comandos síncronos/asíncronos para MVVM. |
| `Microsoft.Extensions.Hosting` | Ciclo de vida, configuración, logging e inyección de dependencias. |
| `Microsoft.Extensions.Http` | Creación y administración de `HttpClient` mediante DI. |
| `Microsoft.Extensions.Options.ConfigurationExtensions` | Enlace y validación de la sección `Api`. |
| `MSTest.Sdk` | SDK y runner de pruebas compatible con CLI y Test Explorer. |

Las versiones están fijadas en los archivos de proyecto. Nullable, analizadores
de .NET y advertencias como errores se aplican desde `Directory.Build.props`.

## Producción y configuración externa

La URL local vive en `appsettings.Development.json`. Producción no incorpora
una URL y exige inyectarla externamente mediante `Api__BaseUrl`; si falta, el
arranque muestra una regla accionable sin revelar ningún valor sensible.
