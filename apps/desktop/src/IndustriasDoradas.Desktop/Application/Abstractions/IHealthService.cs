using IndustriasDoradas.Desktop.Domain;

namespace IndustriasDoradas.Desktop.Application.Abstractions;

public interface IHealthService
{
    Task<SystemHealth> CheckAsync(CancellationToken cancellationToken = default);
}
