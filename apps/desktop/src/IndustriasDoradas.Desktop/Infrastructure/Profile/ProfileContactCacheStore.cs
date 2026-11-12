using System.IO;
using System.Text.Json;
using IndustriasDoradas.Desktop.Application.Profile;

namespace IndustriasDoradas.Desktop.Infrastructure.Profile;

/// <summary>
/// Último perfil central conocido (nombre, correo, teléfono), solo para mostrarlo sin Internet.
/// Vive en un JSON de LocalApplicationData por perfil; no se sincroniza ni entra en SQLite.
/// La API sigue siendo la única fuente de verdad: cada respuesta lo reemplaza.
/// </summary>
public sealed class ProfileContactCacheStore : IProfileContactCache
{
    private const int MaxBytes = 16 * 1024;

    public ProfileContactCacheStore(string directory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        Directory = Path.GetFullPath(directory);
    }

    public string Directory { get; }

    public static string DefaultDirectory() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "IndustriasDoradas",
        "preferences",
        "profile");

    public RemoteSelfProfile? Load(Guid profileId)
    {
        try
        {
            string path = PathFor(profileId);
            if (!File.Exists(path) || new FileInfo(path).Length > MaxBytes) return null;
            RemoteSelfProfile? profile = JsonSerializer.Deserialize<RemoteSelfProfile>(File.ReadAllText(path));
            return profile is null || string.IsNullOrWhiteSpace(profile.DisplayName) ? null : profile;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        {
            return null;
        }
    }

    public void Save(Guid profileId, RemoteSelfProfile profile)
    {
        try
        {
            System.IO.Directory.CreateDirectory(Directory);
            string path = PathFor(profileId);
            File.WriteAllText(path + ".tmp", JsonSerializer.Serialize(profile));
            File.Move(path + ".tmp", path, overwrite: true);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // Sin caché solo se pierde la vista sin conexión; el dato central no cambia.
        }
    }

    private string PathFor(Guid profileId) => Path.Combine(Directory, profileId.ToString("N") + ".json");
}
