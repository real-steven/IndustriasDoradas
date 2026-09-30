using IndustriasDoradas.Desktop.Application.Abstractions;

namespace IndustriasDoradas.Desktop.Infrastructure.Sync;

public sealed class SystemSyncJitter : ISyncJitter
{
    public double NextDouble() => Random.Shared.NextDouble();
}
