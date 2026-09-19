using System.Diagnostics;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Domain.Production;

namespace IndustriasDoradas.Desktop.Application;

public sealed record RegisterCajuelaCommand(
    Guid CommandId,
    Guid StationId,
    DateTimeOffset OccurredAt,
    OperationInputOrigin InputOrigin,
    Guid? LineId = null);

public sealed record RegisterCajuelaResult(
    ProductionEvent Event,
    int Total,
    bool WasDuplicate,
    TimeSpan Elapsed);

public sealed class RegisterCajuelaHandler(
    ILocalCajuelaRepository repository,
    TimeProvider timeProvider,
    IProtectedStationStore? stationStore = null)
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

    public static RegisterCajuelaCommand CreateCommand(
        Guid stationId,
        Guid lineId,
        OperationInputCommand inputCommand)
    {
        EnsureRequired(lineId, nameof(lineId));
        return CreateCommand(stationId, inputCommand) with { LineId = lineId };
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
        OutboxAuthorizationEvidence? authorization = await CaptureAuthorizationAsync(
            command.StationId, cancellationToken).ConfigureAwait(false);
        LocalCajuelaRegistration registration = await repository.RegisterAsync(
                new RegisterCajuelaMutation(
                    command.CommandId,
                    command.StationId,
                    command.OccurredAt,
                    timeProvider.GetUtcNow(),
                    command.InputOrigin,
                    command.LineId,
                    authorization),
                cancellationToken)
            .ConfigureAwait(false);
        TimeSpan elapsed = Stopwatch.GetElapsedTime(startedAt);

        return new RegisterCajuelaResult(
            registration.Event,
            registration.Total,
            registration.WasDuplicate,
            elapsed);
    }

    private async Task<OutboxAuthorizationEvidence?> CaptureAuthorizationAsync(
        Guid stationId,
        CancellationToken cancellationToken)
    {
        if (stationStore is null) return null;
        ProtectedStationState? state = await stationStore.LoadAsync(cancellationToken).ConfigureAwait(false);
        if (state is null || state.IsClosed || state.Authorization.StationId != stationId)
            throw new UnauthorizedAccessException("No existe una autorización activa para registrar producción.");
        return new OutboxAuthorizationEvidence(
            state.Session.ProfileId,
            state.Authorization.PermissionVersion,
            state.Authorization.ValidatedAt,
            state.Authorization.OfflineValidUntil,
            "VALID");
    }

    private static void EnsureRequired(Guid value, string parameterName)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("El UUID es obligatorio.", parameterName);
        }
    }
}
