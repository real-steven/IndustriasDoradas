using System.Text.RegularExpressions;
using IndustriasDoradas.Desktop.Application.Abstractions;

namespace IndustriasDoradas.Desktop.Application;

/// <summary>
/// Catálogo único de eventos de "Seguridad del sistema". Los mismos códigos viajan por el Outbox
/// (<c>SECURITY_EVENT_RECORDED</c>), la API y la auditoría central; la web los traduce.
/// </summary>
public static partial class SecurityAudit
{
    public const string SessionFound = "SESSION_FOUND";
    public const string SessionOpened = "SESSION_OPENED";
    public const string SessionRestored = "SESSION_RESTORED";
    public const string SessionClosed = "SESSION_CLOSED";
    public const string SessionExpired = "SESSION_EXPIRED";
    public const string SessionRejected = "SESSION_REJECTED";
    public const string ElevationRequested = "ELEVATION_REQUESTED";
    public const string ElevationAccepted = "ELEVATION_ACCEPTED";
    public const string ElevationRejected = "ELEVATION_REJECTED";
    public const string ElevationEnded = "ELEVATION_ENDED";
    public const string BiometricRejected = "BIOMETRIC_REJECTED";
    public const string BiometricFaceNotDetected = "BIOMETRIC_FACE_NOT_DETECTED";
    public const string BiometricCameraUnavailable = "BIOMETRIC_CAMERA_UNAVAILABLE";
    public const string BiometricFailed = "BIOMETRIC_FAILED";

    public const string MethodPassword = "PASSWORD";
    public const string MethodSession = "SESSION";
    public const string MethodPin = "PIN";
    public const string MethodPinFallback = "PIN_FALLBACK";
    public const string MethodBiometric = "BIOMETRIC";

    public static readonly IReadOnlySet<string> EventTypes = new HashSet<string>(StringComparer.Ordinal)
    {
        SessionFound, SessionOpened, SessionRestored, SessionClosed, SessionExpired, SessionRejected,
        ElevationRequested, ElevationAccepted, ElevationRejected, ElevationEnded,
        BiometricRejected, BiometricFaceNotDetected, BiometricCameraUnavailable, BiometricFailed,
    };

    public static readonly IReadOnlySet<string> Methods = new HashSet<string>(StringComparer.Ordinal)
    {
        MethodPassword, MethodSession, MethodPin, MethodPinFallback, MethodBiometric,
    };

    /// <summary>
    /// Convierte un código externo (p. ej. la respuesta del PIN) en un código seguro de
    /// auditoría. Cualquier texto libre se reemplaza para no filtrar detalles al historial.
    /// </summary>
    public static string ResultCode(string? value, string fallback = "RECHAZADO") =>
        value is not null && ResultPattern().IsMatch(value) ? value : fallback;

    /// <summary>
    /// Traduce el resultado final de un intento biométrico fallido. Un intento produce un solo
    /// evento: rechazo de identidad, ausencia de rostro, cámara no disponible o fallo técnico.
    /// Devuelve null cuando no hubo intento evaluable (sin registro facial o cancelado).
    /// </summary>
    public static (string EventType, string Result, string Details)? ClassifyBiometricFailure(
        BiometricOperationResult result)
    {
        ArgumentNullException.ThrowIfNull(result);
        if (result.Succeeded) return null;
        return result.Code switch
        {
            "NO_MATCH" => (BiometricRejected, "NO_COINCIDE",
                "El rostro no coincidió con el registro local; el PIN siguió disponible."),
            "FACE_NOT_DETECTED" => (BiometricFaceNotDetected, "TIEMPO_AGOTADO",
                "No se detectó un rostro dentro del tiempo límite; el PIN siguió disponible."),
            "CAMERA_UNAVAILABLE" => (BiometricCameraUnavailable, "NO_DISPONIBLE",
                "La cámara no estaba disponible; el PIN siguió disponible."),
            "CAMERA_BUSY" => (BiometricCameraUnavailable, "EN_USO",
                "La cámara estaba en uso por otra aplicación; el PIN siguió disponible."),
            "NOT_ENROLLED" or "CANCELLED" => null,
            _ => (BiometricFailed, "ERROR_TECNICO",
                "La validación biométrica falló por un error técnico; el PIN siguió disponible."),
        };
    }

    /// <summary>Intento de acceso que no se concedió (contraseña, PIN o biometría).</summary>
    public static bool IsRejection(string eventType) => eventType is
        SessionRejected or ElevationRejected or BiometricRejected or
        BiometricFaceNotDetected or BiometricCameraUnavailable or BiometricFailed;

    public static bool IsElevation(string eventType) =>
        eventType.StartsWith("ELEVATION_", StringComparison.Ordinal) ||
        eventType.StartsWith("BIOMETRIC_", StringComparison.Ordinal);

    /// <summary>Texto comprensible para la vista de desktop; nunca muestra códigos técnicos.</summary>
    public static string Describe(string eventType, string? method) => eventType switch
    {
        SessionFound => "Sesión de estación encontrada",
        SessionOpened => "Inicio de sesión exitoso",
        SessionRestored => "Sesión abierta",
        SessionClosed => "Cierre de estación",
        SessionExpired => "Sesión vencida o cerrada",
        SessionRejected => "Inicio de sesión rechazado",
        ElevationRequested => "Elevación solicitada",
        ElevationAccepted => method switch
        {
            MethodBiometric => "Elevación aceptada mediante biometría",
            MethodPinFallback => "Elevación aceptada con PIN como alternativa",
            _ => "Elevación aceptada mediante PIN",
        },
        ElevationRejected => method == MethodPinFallback
            ? "PIN alternativo rechazado"
            : "PIN rechazado",
        ElevationEnded => "Modo Jefe finalizado",
        BiometricRejected => "Biometría rechazada: identidad no coincide",
        BiometricFaceNotDetected => "No se detectó rostro a tiempo",
        BiometricCameraUnavailable => "Cámara no disponible",
        BiometricFailed => "Fallo técnico de biometría",
        _ => "Evento de seguridad",
    };

    [GeneratedRegex("^[A-Z][A-Z0-9_]{0,39}$", RegexOptions.CultureInvariant)]
    private static partial Regex ResultPattern();
}
