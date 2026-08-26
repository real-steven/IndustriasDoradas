using System.Diagnostics;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain.Production;

namespace IndustriasDoradas.Desktop.Application;

public sealed record RegisterCajuelaCommand(
    Guid CommandId,
    Guid StationId,
    DateTimeOffset OccurredAt);

public sealed record RegisterCajuelaResult(
    ProductionEvent Event,
    int Total,
    bool WasDuplicate,
    TimeSpan Elapsed);

public sealed class RegisterCajuelaHandler(
    ILocalCajuelaRepository repository,
    TimeProvider timeProvider)
{
    public RegisterCajuelaCommand CreateCommand(Guid stationId)
    {
        EnsureRequired(stationId, nameof(stationId));
        return new RegisterCajuelaCommand(Guid.NewGuid(), stationId, timeProvider.GetUtcNow());
    }

    public async Task<RegisterCajuelaResult> ExecuteAsync(
        RegisterCajuelaCommand command,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(command);
        EnsureRequired(command.CommandId, nameof(command));
        EnsureRequired(command.StationId, nameof(command));

        long startedAt = Stopwatch.GetTimestamp();
        LocalCajuelaRegistration registration = await repository.RegisterAsync(
                new RegisterCajuelaMutation(
                    command.CommandId,
                    command.StationId,
                    command.OccurredAt,
                    timeProvider.GetUtcNow()),
                cancellationToken)
            .ConfigureAwait(false);
        TimeSpan elapsed = Stopwatch.GetElapsedTime(startedAt);

        return new RegisterCajuelaResult(
            registration.Event,
            registration.Total,
            registration.WasDuplicate,
            elapsed);
    }

    private static void EnsureRequired(Guid value, string parameterName)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("El UUID es obligatorio.", parameterName);
        }
    }
}
