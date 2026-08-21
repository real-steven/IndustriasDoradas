using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;

namespace IndustriasDoradas.Desktop.Infrastructure.Security;

public sealed class DpapiStationStore : IProtectedStationStore
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("IndustriasDoradas.Station.v1");
    private readonly string path;

    public DpapiStationStore()
    {
        path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "IndustriasDoradas", "station-state.bin");
    }

    public async Task SaveAsync(ProtectedStationState state, CancellationToken cancellationToken = default)
    {
        byte[] plain = JsonSerializer.SerializeToUtf8Bytes(state);
        byte[] protectedBytes = ProtectedData.Protect(plain, Entropy, DataProtectionScope.CurrentUser);
        string directory = Path.GetDirectoryName(path) ?? throw new InvalidOperationException("Secure store path is invalid.");
        Directory.CreateDirectory(directory);
        string temporary = $"{path}.tmp";
        await File.WriteAllBytesAsync(temporary, protectedBytes, cancellationToken).ConfigureAwait(false);
        File.Move(temporary, path, true);
        CryptographicOperations.ZeroMemory(plain);
    }

    public async Task<ProtectedStationState?> LoadAsync(CancellationToken cancellationToken = default)
    {
        if (!File.Exists(path)) return null;
        byte[] protectedBytes = await File.ReadAllBytesAsync(path, cancellationToken).ConfigureAwait(false);
        byte[] plain = ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.CurrentUser);
        try { return JsonSerializer.Deserialize<ProtectedStationState>(plain); }
        finally { CryptographicOperations.ZeroMemory(plain); }
    }

    public async Task ClearAuthorizationAsync(CancellationToken cancellationToken = default)
    {
        ProtectedStationState? state = await LoadAsync(cancellationToken).ConfigureAwait(false);
        if (state is null) return;
        var expired = state with { Authorization = state.Authorization with { OfflineValidUntil = DateTimeOffset.MinValue } };
        await SaveAsync(expired, cancellationToken).ConfigureAwait(false);
    }
}
