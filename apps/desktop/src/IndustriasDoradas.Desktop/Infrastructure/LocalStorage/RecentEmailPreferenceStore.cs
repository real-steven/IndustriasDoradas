using System.IO;
using System.Security;
using System.Text;

namespace IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

/// <summary>
/// Preferencia "Recordar correo" de este equipo y de este usuario de Windows.
/// Solo guarda el correo en texto plano bajo LocalApplicationData (no se sincroniza ni
/// viaja con el perfil itinerante). Nunca contiene contraseña, PIN, token ni sesión.
/// Un archivo inexistente, ilegible o corrupto equivale a "sin correo recordado".
/// </summary>
public sealed class RecentEmailPreferenceStore
{
    // Mismo archivo que usaban versiones anteriores, para no perder la preferencia existente.
    public const string FileName = "recent-email.txt";
    private const int MaxEmailLength = 254;
    private const int MaxFileBytes = 1024;
    private static readonly UTF8Encoding Utf8 = new(encoderShouldEmitUTF8Identifier: false);

    public RecentEmailPreferenceStore()
        : this(DefaultPath())
    {
    }

    public RecentEmailPreferenceStore(string filePath)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(filePath);
        FilePath = Path.GetFullPath(filePath);
    }

    public string FilePath { get; }

    public static string DefaultPath() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "IndustriasDoradas",
        FileName);

    /// <summary>Devuelve el correo recordado o <c>null</c> si no hay uno válido.</summary>
    public string? Load()
    {
        try
        {
            var file = new FileInfo(FilePath);
            if (!file.Exists || file.Length > MaxFileBytes) return null;
            string email = File.ReadAllText(FilePath, Utf8).Trim().TrimStart('﻿');
            return IsStorableEmail(email) ? email : null;
        }
        catch (Exception exception) when (IsStorageFailure(exception))
        {
            return null;
        }
    }

    /// <summary>Guarda el correo; devuelve <c>false</c> si no es un correo válido o no se pudo escribir.</summary>
    public bool Remember(string? email)
    {
        string normalized = email?.Trim() ?? string.Empty;
        if (!IsStorableEmail(normalized)) return false;

        string temporaryPath = FilePath + ".tmp";
        try
        {
            string? directory = Path.GetDirectoryName(FilePath);
            if (string.IsNullOrWhiteSpace(directory)) return false;
            Directory.CreateDirectory(directory);
            // Escritura atómica: un cierre inesperado nunca deja el archivo a medias.
            File.WriteAllText(temporaryPath, normalized, Utf8);
            File.Move(temporaryPath, FilePath, overwrite: true);
            return true;
        }
        catch (Exception exception) when (IsStorageFailure(exception))
        {
            TryDelete(temporaryPath);
            return false;
        }
    }

    /// <summary>Elimina el correo recordado. No falla si el archivo no existe.</summary>
    public void Forget()
    {
        TryDelete(FilePath);
        TryDelete(FilePath + ".tmp");
    }

    internal static bool IsStorableEmail(string value)
    {
        if (value.Length is < 3 or > MaxEmailLength) return false;
        int at = value.IndexOf('@', StringComparison.Ordinal);
        if (at <= 0 || at != value.LastIndexOf('@') || at == value.Length - 1) return false;
        foreach (char character in value)
        {
            if (char.IsWhiteSpace(character) || char.IsControl(character)) return false;
        }
        return true;
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch (Exception exception) when (IsStorageFailure(exception))
        {
            // Si no se puede borrar, la próxima lectura lo validará igualmente.
        }
    }

    private static bool IsStorageFailure(Exception exception) =>
        exception is IOException
            or UnauthorizedAccessException
            or SecurityException
            or NotSupportedException
            or ArgumentException;
}
