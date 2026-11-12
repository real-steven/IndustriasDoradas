using System.IO;
using System.Security;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows.Input;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;

namespace IndustriasDoradas.Desktop.Infrastructure.Input;

/// <summary>
/// Guarda los atajos de teclado en un JSON local de esta estación y este usuario de Windows.
/// Funciona sin Internet; nada se guarda en SQLite, Supabase ni Outbox. Un archivo ausente,
/// dañado o con asignaciones inválidas equivale a los atajos predeterminados.
/// </summary>
public sealed class KeyboardShortcutPreferenceStore : IKeyboardShortcutSettings
{
    public const string FileName = "shortcuts.json";
    private const int MaxSettingsBytes = 64 * 1024;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
    };

    private readonly object gate = new();
    private KeyboardShortcutMap current;

    public KeyboardShortcutPreferenceStore(string directory, KeyboardShortcutRules? rules = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        Directory = Path.GetFullPath(directory);
        Rules = rules ?? new KeyboardShortcutRules();
        current = LoadFromDisk();
    }

    public string Directory { get; }

    public KeyboardShortcutRules Rules { get; }

    private string SettingsPath => Path.Combine(Directory, FileName);

    public KeyboardShortcutMap Current
    {
        get
        {
            lock (gate) return current;
        }
    }

    public static string DefaultDirectory(Guid stationId) => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "IndustriasDoradas",
        "preferences",
        "keyboard",
        stationId == Guid.Empty ? "default" : stationId.ToString("N"));

    /// <summary>Normaliza el nombre de una tecla WPF; devuelve null si no es una tecla conocida.</summary>
    public static string? NormalizeKeyName(string? keyName)
    {
        if (string.IsNullOrWhiteSpace(keyName) ||
            int.TryParse(keyName, out _) ||
            !Enum.TryParse(keyName.Trim(), ignoreCase: true, out Key key) ||
            !Enum.IsDefined(key))
        {
            return null;
        }

        // Key tiene alias (Enter/Return, PageDown/Next...); ToString da el nombre canónico que usa la vista.
        return key.ToString();
    }

    public bool Save(KeyboardShortcutMap map)
    {
        ArgumentNullException.ThrowIfNull(map);
        KeyboardShortcutMap? normalized = Normalize(map);
        if (normalized is null || !Rules.IsValid(normalized)) return false;

        var stored = new StoredShortcuts
        {
            Version = 1,
            Bindings = Enum.GetValues<KeyboardShortcutAction>().ToDictionary(
                action => action,
                action => (List<string>?)normalized.KeysFor(action).ToList()),
        };
        lock (gate)
        {
            try
            {
                System.IO.Directory.CreateDirectory(Directory);
                string temporaryPath = SettingsPath + ".tmp";
                File.WriteAllBytes(temporaryPath, JsonSerializer.SerializeToUtf8Bytes(stored, JsonOptions));
                File.Move(temporaryPath, SettingsPath, overwrite: true);
            }
            catch (Exception exception) when (IsStorageFailure(exception))
            {
                return false;
            }

            current = normalized;
            return true;
        }
    }

    private KeyboardShortcutMap LoadFromDisk()
    {
        try
        {
            var file = new FileInfo(SettingsPath);
            if (!file.Exists || file.Length > MaxSettingsBytes) return KeyboardShortcutMap.Default;
            StoredShortcuts? stored = JsonSerializer.Deserialize<StoredShortcuts>(
                File.ReadAllText(file.FullName), JsonOptions);
            if (stored?.Bindings is null) return KeyboardShortcutMap.Default;

            var bindings = new Dictionary<KeyboardShortcutAction, IReadOnlyList<string>>();
            foreach ((KeyboardShortcutAction action, List<string>? keys) in stored.Bindings)
            {
                if (!Enum.IsDefined(action) || keys is null) continue;
                bindings[action] = keys;
            }

            // Una acción nueva que el archivo aún no conoce toma su tecla predeterminada.
            foreach (KeyboardShortcutAction action in Enum.GetValues<KeyboardShortcutAction>())
            {
                if (!bindings.ContainsKey(action)) bindings[action] = KeyboardShortcutMap.Default.KeysFor(action);
            }

            KeyboardShortcutMap? map = Normalize(new KeyboardShortcutMap(bindings));
            return map is not null && Rules.IsValid(map) ? map : KeyboardShortcutMap.Default;
        }
        catch (Exception exception) when (IsStorageFailure(exception) || exception is JsonException)
        {
            return KeyboardShortcutMap.Default;
        }
    }

    private static KeyboardShortcutMap? Normalize(KeyboardShortcutMap map)
    {
        var bindings = new Dictionary<KeyboardShortcutAction, IReadOnlyList<string>>();
        foreach (KeyboardShortcutAction action in Enum.GetValues<KeyboardShortcutAction>())
        {
            var keys = new List<string>();
            foreach (string key in map.KeysFor(action))
            {
                string? normalized = NormalizeKeyName(key);
                if (normalized is null) return null;
                keys.Add(normalized);
            }

            bindings[action] = keys;
        }

        return new KeyboardShortcutMap(bindings);
    }

    private static bool IsStorageFailure(Exception exception) =>
        exception is IOException
            or UnauthorizedAccessException
            or SecurityException
            or NotSupportedException
            or ArgumentException;

    private sealed class StoredShortcuts
    {
        public int Version { get; set; }
        public Dictionary<KeyboardShortcutAction, List<string>?>? Bindings { get; set; }
    }
}
