namespace IndustriasDoradas.Desktop.Application.Profile;

/// <summary>Datos centrales del perfil propio que devuelve la API (fuente única).</summary>
public sealed record RemoteSelfProfile(string DisplayName, string? Email, string? Phone);

public enum PhoneUpdateStatus
{
    Saved,
    InvalidPhone,
    PinRejected,
    PinBlocked,
    ConnectionRequired,
    SessionExpired,
    Failed,
}

public sealed record PhoneUpdateResult(PhoneUpdateStatus Status, string? Phone = null, int? RemainingAttempts = null);

/// <summary>Única puerta remota del perfil: la API NestJS. Nunca Supabase directo.</summary>
public interface IProfileApi
{
    Task<RemoteSelfProfile> GetSelfProfileAsync(string accessToken, CancellationToken cancellationToken = default);

    Task<PhoneUpdateResult> UpdatePhoneAsync(
        Guid organizationId,
        Guid stationId,
        string? phone,
        string pin,
        string accessToken,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Último perfil central conocido en este equipo, solo para mostrarlo sin Internet. No es una
/// segunda fuente de verdad: se reemplaza cada vez que la API responde.
/// </summary>
public interface IProfileContactCache
{
    RemoteSelfProfile? Load(Guid profileId);
    void Save(Guid profileId, RemoteSelfProfile profile);
}

public enum PhotoImportStatus
{
    Saved,
    TooLarge,
    Unsupported,
    Corrupt,
    TooSmall,
    Failed,
}

/// <summary>
/// Fotografía de perfil estrictamente local de este equipo. Nunca va a SQLite, Outbox,
/// sincronización, respaldos ni diagnósticos, y nunca se usa para biometría.
/// </summary>
public interface IProfilePhotoStore
{
    Task<PhotoImportStatus> ImportAsync(Guid profileId, string sourcePath, CancellationToken cancellationToken = default);

    /// <summary>Devuelve el JPEG ya verificado, o null si falta o está dañado (se muestran las iniciales).</summary>
    byte[]? Load(Guid profileId);

    void Remove(Guid profileId);
}
