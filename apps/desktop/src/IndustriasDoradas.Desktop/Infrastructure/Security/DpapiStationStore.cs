using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Infrastructure.LocalStorage;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Infrastructure.Security;

public sealed class DpapiStationStore : IProtectedStationStore
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("IndustriasDoradas.Station.v1");
    private readonly string path;
    private readonly string legacyPath;
    private readonly Guid stationId;

    public DpapiStationStore(
        ILocalDatabasePathProvider databasePathProvider,
        IOptions<StationOptions> stationOptions)
    {
        ArgumentNullException.ThrowIfNull(databasePathProvider);
        ArgumentNullException.ThrowIfNull(stationOptions);
        stationId = stationOptions.Value.Id;
        if (stationId == Guid.Empty)
        {
            throw new InvalidOperationException("Secure store requires a valid station.");
        }
        string stationDirectory = Path.GetDirectoryName(databasePathProvider.DatabasePath)
            ?? throw new InvalidOperationException("Secure store path is invalid.");
        path = Path.Combine(stationDirectory, "station-state.bin");
        legacyPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "IndustriasDoradas",
            "station-state.bin");
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
        string sourcePath = File.Exists(path)
            ? path
            : legacyPath;
        if (!File.Exists(sourcePath)) return null;

        byte[] protectedBytes = await File.ReadAllBytesAsync(sourcePath, cancellationToken).ConfigureAwait(false);
        byte[] plain = ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.CurrentUser);
        try
        {
            ProtectedStationState? state = JsonSerializer.Deserialize<ProtectedStationState>(plain);
            if (state is not null && state.Authorization.StationId != stationId)
            {
                return null;
            }
            if (state is not null && sourcePath == legacyPath)
            {
                await SaveAsync(state, cancellationToken).ConfigureAwait(false);
            }
            return state;
        }
        finally { CryptographicOperations.ZeroMemory(plain); }
    }

    public async Task CloseSessionAsync(CancellationToken cancellationToken = default)
    {
        ProtectedStationState? state = await LoadAsync(cancellationToken).ConfigureAwait(false);
        if (state is null) return;
        var closed = state with
        {
            Tokens = new AuthTokens(string.Empty, string.Empty, DateTimeOffset.MinValue),
            Authorization = state.Authorization with { OfflineValidUntil = DateTimeOffset.MinValue },
            IsClosed = true,
        };
        await SaveAsync(closed, cancellationToken).ConfigureAwait(false);
    }
}
