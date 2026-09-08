using System.Diagnostics;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain.Production;

namespace IndustriasDoradas.Desktop.Application;

public sealed record RegisterCajuelaCommand(
    Guid CommandId,
    Guid StationId,
    DateTimeOffset OccurredAt,
    OperationInputOrigin InputOrigin);

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
        return new RegisterCajuelaCommand(
            Guid.NewGuid(),
            stationId,
            timeProvider.GetUtcNow(),
            OperationInputOrigin.Application());
    }

    public static RegisterCajuelaCommand CreateCommand(
        Guid stationId,
        OperationInputCommand inputCommand)
    {
        EnsureRequired(stationId, nameof(stationId));
        ArgumentNullException.ThrowIfNull(inputCommand);
        if (inputCommand.Action != OperationInputAction.RegisterCajuela)
        {
            throw new ArgumentException("El comando de entrada no registra una cajuela.", nameof(inputCommand));
        }

        return new RegisterCajuelaCommand(
            inputCommand.CommandId,
            stationId,
            inputCommand.OccurredAt,
            inputCommand.Origin);
    }

    public async Task<RegisterCajuelaResult> ExecuteAsync(
        RegisterCajuelaCommand command,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(command);
        EnsureRequired(command.CommandId, nameof(command));
        EnsureRequired(command.StationId, nameof(command));
        command.InputOrigin.Validate();

        long startedAt = Stopwatch.GetTimestamp();
        LocalCajuelaRegistration registration = await repository.RegisterAsync(
                new RegisterCajuelaMutation(
                    command.CommandId,
                    command.StationId,
                    command.OccurredAt,
                    timeProvider.GetUtcNow(),
                    command.InputOrigin),
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
