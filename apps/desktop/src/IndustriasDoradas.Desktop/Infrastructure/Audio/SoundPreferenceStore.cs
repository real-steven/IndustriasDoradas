using System.IO;
using System.Security;
using System.Text.Json;
using System.Text.Json.Serialization;
using IndustriasDoradas.Desktop.Application.Abstractions;

namespace IndustriasDoradas.Desktop.Infrastructure.Audio;

public sealed record SoundAssignment(string StoredFileName, string OriginalFileName);

public sealed record SoundPreferences(
    bool Enabled,
    IReadOnlyDictionary<FeedbackSoundEvent, SoundAssignment> Assignments)
{
    public static SoundPreferences Default { get; } = new(true, new Dictionary<FeedbackSoundEvent, SoundAssignment>());
}

public sealed record SoundImportResult(bool Succeeded, string Message);

/// <summary>
/// Preferencias de sonido locales de esta estación y este usuario de Windows.
/// Guarda una copia administrada de cada WAV elegido, de modo que mover o borrar el
/// original no rompe la configuración. Nada de esto se sincroniza ni se guarda en SQLite.
/// </summary>
public sealed class SoundPreferenceStore
{
    private const string SettingsFileName = "settings.json";
    private const string FilesFolderName = "files";
    private const int MaxSettingsBytes = 64 * 1024;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
    };

    private readonly object gate = new();

    public SoundPreferenceStore(string directory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        Directory = Path.GetFullPath(directory);
    }

    public string Directory { get; }

    private string SettingsPath => Path.Combine(Directory, SettingsFileName);

    private string FilesDirectory => Path.Combine(Directory, FilesFolderName);

    public static string DefaultDirectory(Guid stationId) => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "IndustriasDoradas",
        "preferences",
        "sounds",
        stationId == Guid.Empty ? "default" : stationId.ToString("N"));

    /// <summary>
    /// Lee las preferencias. Un archivo ausente o corrupto equivale a la configuración
    /// predeterminada; nunca lanza excepciones.
    /// </summary>
    public SoundPreferences Load()
    {
        lock (gate)
        {
            return LoadUnsafe();
        }
    }

    public void SetEnabled(bool enabled)
    {
        lock (gate)
        {
            SoundPreferences current = LoadUnsafe();
            SaveUnsafe(current with { Enabled = enabled });
        }
    }

    public SoundImportResult Import(FeedbackSoundEvent sound, string sourcePath)
    {
        if (string.IsNullOrWhiteSpace(sourcePath) || !WaveFileValidator.HasSupportedExtension(sourcePath))
        {
            return new SoundImportResult(false, "Seleccione un archivo .wav.");
        }

        byte[] bytes;
        try
        {
            var source = new FileInfo(sourcePath);
            if (!source.Exists) return new SoundImportResult(false, "El archivo seleccionado ya no existe.");
            if (source.Length > WaveFileValidator.MaxFileBytes)
            {
                return new SoundImportResult(false, "El archivo supera 5 MB.");
            }
            bytes = File.ReadAllBytes(source.FullName);
        }
        catch (Exception exception) when (IsStorageFailure(exception))
        {
            return new SoundImportResult(false, "No se pudo leer el archivo seleccionado.");
        }

        if (!WaveFileValidator.IsPlayablePcmWave(bytes, out string reason))
        {
            return new SoundImportResult(false, reason);
        }

        lock (gate)
        {
            string storedName = $"{sound}-{Guid.NewGuid():N}{WaveFileValidator.SupportedExtension}";
            string storedPath = Path.Combine(FilesDirectory, storedName);
            try
            {
                System.IO.Directory.CreateDirectory(FilesDirectory);
                WriteAtomically(storedPath, bytes);
            }
            catch (Exception exception) when (IsStorageFailure(exception))
            {
                TryDelete(storedPath);
                return new SoundImportResult(false, "No se pudo guardar una copia local del sonido.");
            }

            SoundPreferences current = LoadUnsafe();
            var assignments = new Dictionary<FeedbackSoundEvent, SoundAssignment>(current.Assignments)
            {
                [sound] = new SoundAssignment(storedName, Path.GetFileName(sourcePath)),
            };
            if (!SaveUnsafe(current with { Assignments = assignments }))
            {
                TryDelete(storedPath);
                return new SoundImportResult(false, "No se pudo guardar la configuración de sonido.");
            }

            if (current.Assignments.TryGetValue(sound, out SoundAssignment? previous))
            {
                TryDelete(Path.Combine(FilesDirectory, previous.StoredFileName));
            }
            return new SoundImportResult(true, $"Sonido asignado: {Path.GetFileName(sourcePath)}.");
        }
    }

    public void Restore(FeedbackSoundEvent sound)
    {
        lock (gate)
        {
            SoundPreferences current = LoadUnsafe();
            if (!current.Assignments.TryGetValue(sound, out SoundAssignment? previous)) return;
            var assignments = new Dictionary<FeedbackSoundEvent, SoundAssignment>(current.Assignments);
            assignments.Remove(sound);
            if (SaveUnsafe(current with { Assignments = assignments }))
            {
                TryDelete(Path.Combine(FilesDirectory, previous.StoredFileName));
            }
        }
    }

    /// <summary>
    /// Devuelve el audio personalizado de la acción o <c>null</c> si no hay uno válido
    /// (sin asignar, archivo ausente o dañado); en ese caso se usa el predeterminado.
    /// </summary>
    public byte[]? ReadCustomSound(SoundAssignment assignment)
    {
        try
        {
            // El nombre lo genera la aplicación; se descarta cualquier ruta inyectada en el JSON.
            string fileName = Path.GetFileName(assignment.StoredFileName);
            if (fileName.Length == 0 || !WaveFileValidator.HasSupportedExtension(fileName)) return null;
            var file = new FileInfo(Path.Combine(FilesDirectory, fileName));
            if (!file.Exists || file.Length > WaveFileValidator.MaxFileBytes) return null;
            byte[] bytes = File.ReadAllBytes(file.FullName);
            return WaveFileValidator.IsPlayablePcmWave(bytes, out _) ? bytes : null;
        }
        catch (Exception exception) when (IsStorageFailure(exception))
        {
            return null;
        }
    }

    private SoundPreferences LoadUnsafe()
    {
        try
        {
            var file = new FileInfo(SettingsPath);
            if (!file.Exists || file.Length > MaxSettingsBytes) return SoundPreferences.Default;
            StoredSoundPreferences? stored = JsonSerializer.Deserialize<StoredSoundPreferences>(
                File.ReadAllText(file.FullName), JsonOptions);
            if (stored is null) return SoundPreferences.Default;

            var assignments = new Dictionary<FeedbackSoundEvent, SoundAssignment>();
            foreach ((FeedbackSoundEvent sound, StoredAssignment? value) in stored.Assignments ?? [])
            {
                if (!Enum.IsDefined(sound) || value is null) continue;
                if (string.IsNullOrWhiteSpace(value.File) || string.IsNullOrWhiteSpace(value.OriginalName)) continue;
                assignments[sound] = new SoundAssignment(value.File, value.OriginalName);
            }
            return new SoundPreferences(stored.Enabled ?? true, assignments);
        }
        catch (Exception exception) when (IsStorageFailure(exception) || exception is JsonException)
        {
            return SoundPreferences.Default;
        }
    }

    private bool SaveUnsafe(SoundPreferences preferences)
    {
        var stored = new StoredSoundPreferences
        {
            Version = 1,
            Enabled = preferences.Enabled,
            Assignments = preferences.Assignments.ToDictionary(
                pair => pair.Key,
                pair => (StoredAssignment?)new StoredAssignment
                {
                    File = pair.Value.StoredFileName,
                    OriginalName = pair.Value.OriginalFileName,
                }),
        };
        try
        {
            System.IO.Directory.CreateDirectory(Directory);
            WriteAtomically(SettingsPath, JsonSerializer.SerializeToUtf8Bytes(stored, JsonOptions));
            return true;
        }
        catch (Exception exception) when (IsStorageFailure(exception))
        {
            return false;
        }
    }

    private static void WriteAtomically(string path, byte[] bytes)
    {
        string temporaryPath = path + ".tmp";
        File.WriteAllBytes(temporaryPath, bytes);
        File.Move(temporaryPath, path, overwrite: true);
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch (Exception exception) when (IsStorageFailure(exception))
        {
            // Un archivo huérfano no afecta la reproducción; se ignora.
        }
    }

    private static bool IsStorageFailure(Exception exception) =>
        exception is IOException
            or UnauthorizedAccessException
            or SecurityException
            or NotSupportedException
            or ArgumentException;

    private sealed class StoredSoundPreferences
    {
        public int Version { get; set; }
        public bool? Enabled { get; set; }
        public Dictionary<FeedbackSoundEvent, StoredAssignment?>? Assignments { get; set; }
    }

    private sealed class StoredAssignment
    {
        public string? File { get; set; }
        public string? OriginalName { get; set; }
    }
}
