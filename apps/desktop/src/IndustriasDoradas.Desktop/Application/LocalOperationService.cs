using System.Text.Json;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Domain.Production;

namespace IndustriasDoradas.Desktop.Application;

public sealed record OperationAuthority(
    Guid ActorProfileId,
    Guid OrganizationId,
    Guid PlantId,
    Guid StationId,
    int PermissionVersion,
    DateTimeOffset? AuthorizationValidatedAt = null,
    DateTimeOffset? AuthorizationOfflineUntil = null,
    string AuthorizationState = "VALID")
{
    public static OperationAuthority From(ProtectedStationState state)
    {
        ArgumentNullException.ThrowIfNull(state);
        if (state.Session.OrganizationId != state.Authorization.OrganizationId)
        {
            throw new UnauthorizedAccessException(
                "La sesión y la autorización de estación pertenecen a organizaciones diferentes.");
        }

        return new OperationAuthority(
            state.Session.ProfileId,
            state.Authorization.OrganizationId,
            state.Authorization.PlantId,
            state.Authorization.StationId,
            state.Authorization.PermissionVersion,
            state.Authorization.ValidatedAt,
            state.Authorization.OfflineValidUntil);
    }
}

public sealed record PreparedOperationStart(
    Guid OrganizationId,
    Guid PlantId,
    Guid StationId,
    Guid LineId,
    Guid SupplierId,
    Guid ResponsibleWorkerId,
    OperationAuthority Authority);

public sealed record PreparedResponsibleRelief(
    LocalOperationalSession ExpectedSession,
    Guid NextResponsibleWorkerId,
    OperationAuthority Authority);

public sealed record PreparedOperationCompletion(
    LocalOperationalSession ExpectedSession,
    OperationAuthority Authority);

public sealed record LocalOperationContext(
    LocalOperationalSession? Session,
    WorkPeriod CurrentWorkPeriod)
{
    public bool CanRegisterCajuela => Session?.Status == LineFeedCycleStatus.Active;
}

public sealed class LocalOperationService(
    ILocalCatalogRepository catalogs,
    ILocalOperationalSessionRepository sessions,
    ILocalOperationRepository operations,
    TimeProvider timeProvider)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<PreparedOperationStart> PrepareStartAsync(
        Guid lineId,
        Guid supplierId,
        Guid responsibleWorkerId,
        OperationAuthority authority,
        CancellationToken cancellationToken = default)
    {
        ValidateAuthority(authority);

        CachedSupplier supplier = await RequireSupplierAsync(
                supplierId,
                authority.OrganizationId,
                cancellationToken)
            .ConfigureAwait(false);
        CachedProductionLine line = await RequireLineAsync(
                lineId,
                authority.OrganizationId,
                authority.PlantId,
                cancellationToken)
            .ConfigureAwait(false);
        CachedWorker worker = await RequireWorkerAsync(
                responsibleWorkerId,
                authority.OrganizationId,
                cancellationToken)
            .ConfigureAwait(false);
        LocalOperationalSession? current = await sessions.LoadAsync(authority.StationId, cancellationToken)
            .ConfigureAwait(false);
        if (current?.Status == LineFeedCycleStatus.Active)
        {
            throw new InvalidOperationException("La estación ya tiene un cargamento activo.");
        }

        return new PreparedOperationStart(
            authority.OrganizationId,
            authority.PlantId,
            authority.StationId,
            line.Id,
            supplier.Id,
            worker.Id,
            authority);
    }

    public async Task<LocalOperationContext> ConfirmStartAsync(
        PreparedOperationStart prepared,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(prepared);
        ValidateAuthority(prepared.Authority);
        EnsureAuthorityScope(
            prepared.Authority,
            prepared.OrganizationId,
            prepared.PlantId,
            prepared.StationId);
        DateTimeOffset now = timeProvider.GetUtcNow();
        Guid shipmentId = Guid.NewGuid();
        Guid feedCycleId = Guid.NewGuid();
        Guid assignmentId = Guid.NewGuid();
        var session = new LocalOperationalSession(
            prepared.StationId,
            prepared.OrganizationId,
            prepared.PlantId,
            prepared.LineId,
            shipmentId,
            feedCycleId,
            prepared.ResponsibleWorkerId,
            now,
            now,
            LineFeedCycleStatus.Active);
        PendingOutboxMessage outbox = CreateOutbox(
            "OPERATION_STARTED",
            shipmentId,
            now,
            new
            {
                schemaVersion = 1,
                shipmentId,
                feedCycleId,
                responsibilityAssignmentId = assignmentId,
                prepared.OrganizationId,
                prepared.PlantId,
                prepared.StationId,
                prepared.LineId,
                prepared.SupplierId,
                prepared.ResponsibleWorkerId,
                prepared.Authority.ActorProfileId,
                prepared.Authority.PermissionVersion,
                occurredAtUtc = now,
            },
            prepared.Authority);

        await operations.StartAsync(
                new StartLocalOperationMutation(session, prepared.SupplierId, assignmentId, outbox),
                cancellationToken)
            .ConfigureAwait(false);
        return new LocalOperationContext(session, WorkPeriodSchedule.At(now));
    }

    public async Task<PreparedResponsibleRelief> PrepareReliefAsync(
        Guid nextResponsibleWorkerId,
        OperationAuthority authority,
        CancellationToken cancellationToken = default) =>
        await PrepareReliefCoreAsync(
                null,
                nextResponsibleWorkerId,
                authority,
                cancellationToken)
            .ConfigureAwait(false);

    public async Task<PreparedResponsibleRelief> PrepareReliefAsync(
        Guid lineId,
        Guid nextResponsibleWorkerId,
        OperationAuthority authority,
        CancellationToken cancellationToken = default) =>
        await PrepareReliefCoreAsync(
                lineId,
                nextResponsibleWorkerId,
                authority,
                cancellationToken)
            .ConfigureAwait(false);

    private async Task<PreparedResponsibleRelief> PrepareReliefCoreAsync(
        Guid? lineId,
        Guid nextResponsibleWorkerId,
        OperationAuthority authority,
        CancellationToken cancellationToken)
    {
        ValidateAuthority(authority);
        LocalOperationalSession current = await RequireActiveSessionAsync(
                authority.StationId,
                lineId,
                cancellationToken)
            .ConfigureAwait(false);
        EnsureAuthorityScope(authority, current.OrganizationId, current.PlantId, current.StationId);
        CachedWorker worker = await RequireWorkerAsync(
                nextResponsibleWorkerId,
                current.OrganizationId,
                cancellationToken)
            .ConfigureAwait(false);
        if (worker.Id == current.ResponsibleWorkerId)
        {
            throw new InvalidOperationException("El relevo debe asignar a una persona diferente.");
        }

        return new PreparedResponsibleRelief(current, worker.Id, authority);
    }

    public async Task<LocalOperationContext> ConfirmReliefAsync(
        PreparedResponsibleRelief prepared,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(prepared);
        ValidateAuthority(prepared.Authority);
        DateTimeOffset now = timeProvider.GetUtcNow();
        Guid assignmentId = Guid.NewGuid();
        LocalOperationalSession current = prepared.ExpectedSession;
        EnsureAuthorityScope(prepared.Authority, current.OrganizationId, current.PlantId, current.StationId);
        var updated = current with
        {
            ResponsibleWorkerId = prepared.NextResponsibleWorkerId,
            UpdatedAt = now,
        };
        PendingOutboxMessage outbox = CreateOutbox(
            "RESPONSIBLE_RELIEVED",
            current.ShipmentId,
            now,
            new
            {
                schemaVersion = 1,
                current.ShipmentId,
                current.FeedCycleId,
                responsibilityAssignmentId = assignmentId,
                previousResponsibleWorkerId = current.ResponsibleWorkerId,
                nextResponsibleWorkerId = prepared.NextResponsibleWorkerId,
                current.OrganizationId,
                current.PlantId,
                current.StationId,
                current.LineId,
                prepared.Authority.ActorProfileId,
                prepared.Authority.PermissionVersion,
                occurredAtUtc = now,
            },
            prepared.Authority);

        await operations.RelieveAsync(
                new RelieveLocalOperationMutation(current, prepared.NextResponsibleWorkerId, assignmentId, now, outbox),
                cancellationToken)
            .ConfigureAwait(false);
        return new LocalOperationContext(updated, WorkPeriodSchedule.At(now));
    }

    public async Task<PreparedOperationCompletion> PrepareCompletionAsync(
        OperationAuthority authority,
        CancellationToken cancellationToken = default) =>
        await PrepareCompletionCoreAsync(null, authority, cancellationToken).ConfigureAwait(false);

    public async Task<PreparedOperationCompletion> PrepareCompletionAsync(
        Guid lineId,
        OperationAuthority authority,
        CancellationToken cancellationToken = default) =>
        await PrepareCompletionCoreAsync(lineId, authority, cancellationToken).ConfigureAwait(false);

    private async Task<PreparedOperationCompletion> PrepareCompletionCoreAsync(
        Guid? lineId,
        OperationAuthority authority,
        CancellationToken cancellationToken)
    {
        ValidateAuthority(authority);
        LocalOperationalSession current = await RequireActiveSessionAsync(
                authority.StationId,
                lineId,
                cancellationToken)
            .ConfigureAwait(false);
        EnsureAuthorityScope(authority, current.OrganizationId, current.PlantId, current.StationId);
        return new PreparedOperationCompletion(current, authority);
    }

    public async Task<LocalOperationContext> ConfirmCompletionAsync(
        PreparedOperationCompletion prepared,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(prepared);
        ValidateAuthority(prepared.Authority);
        DateTimeOffset now = timeProvider.GetUtcNow();
        LocalOperationalSession current = prepared.ExpectedSession;
        EnsureAuthorityScope(prepared.Authority, current.OrganizationId, current.PlantId, current.StationId);
        var completed = current with
        {
            UpdatedAt = now,
            Status = LineFeedCycleStatus.Completed,
        };
        PendingOutboxMessage outbox = CreateOutbox(
            "OPERATION_COMPLETED",
            current.ShipmentId,
            now,
            new
            {
                schemaVersion = 1,
                current.ShipmentId,
                current.FeedCycleId,
                current.OrganizationId,
                current.PlantId,
                current.StationId,
                current.LineId,
                current.ResponsibleWorkerId,
                prepared.Authority.ActorProfileId,
                prepared.Authority.PermissionVersion,
                occurredAtUtc = now,
            },
            prepared.Authority);

        await operations.CompleteAsync(
                new CompleteLocalOperationMutation(current, now, outbox),
                cancellationToken)
            .ConfigureAwait(false);
        return new LocalOperationContext(completed, WorkPeriodSchedule.At(now));
    }

    public async Task<LocalOperationContext> GetContextAsync(
        Guid stationId,
        CancellationToken cancellationToken = default)
    {
        EnsureRequired(stationId, nameof(stationId));
        LocalOperationalSession? current = await sessions.LoadAsync(stationId, cancellationToken)
            .ConfigureAwait(false);
        return new LocalOperationContext(current, WorkPeriodSchedule.At(timeProvider.GetUtcNow()));
    }

    public async Task<LocalOperationContext> GetContextAsync(
        Guid stationId,
        Guid lineId,
        CancellationToken cancellationToken = default)
    {
        EnsureRequired(stationId, nameof(stationId));
        EnsureRequired(lineId, nameof(lineId));
        LocalOperationalSession? current = await sessions.LoadAsync(stationId, lineId, cancellationToken)
            .ConfigureAwait(false);
        return new LocalOperationContext(current, WorkPeriodSchedule.At(timeProvider.GetUtcNow()));
    }

    public async Task<IReadOnlyList<LocalOperationContext>> GetContextsAsync(
        Guid stationId,
        CancellationToken cancellationToken = default)
    {
        EnsureRequired(stationId, nameof(stationId));
        IReadOnlyList<LocalOperationalSession> current = await sessions
            .ListActiveAsync(stationId, cancellationToken)
            .ConfigureAwait(false);
        WorkPeriod workPeriod = WorkPeriodSchedule.At(timeProvider.GetUtcNow());
        return current.Select(session => new LocalOperationContext(session, workPeriod)).ToArray();
    }

    public async Task<LocalOperationalSession> RequireActiveContextAsync(
        Guid stationId,
        CancellationToken cancellationToken = default) =>
        await RequireActiveSessionAsync(stationId, null, cancellationToken).ConfigureAwait(false);

    public async Task<LocalOperationalSession> RequireActiveContextAsync(
        Guid stationId,
        Guid lineId,
        CancellationToken cancellationToken = default) =>
        await RequireActiveSessionAsync(stationId, lineId, cancellationToken).ConfigureAwait(false);

    private async Task<CachedSupplier> RequireSupplierAsync(
        Guid supplierId,
        Guid organizationId,
        CancellationToken cancellationToken)
    {
        EnsureRequired(supplierId, nameof(supplierId));
        CachedSupplier? supplier = await catalogs.FindSupplierAsync(supplierId, cancellationToken)
            .ConfigureAwait(false);
        if (supplier is null || supplier.OrganizationId != organizationId || !supplier.IsActive)
        {
            throw new InvalidOperationException("El proveedor no está activo en la organización.");
        }

        return supplier;
    }

    private async Task<CachedWorker> RequireWorkerAsync(
        Guid workerId,
        Guid organizationId,
        CancellationToken cancellationToken)
    {
        EnsureRequired(workerId, nameof(workerId));
        CachedWorker? worker = await catalogs.FindWorkerAsync(workerId, cancellationToken)
            .ConfigureAwait(false);
        if (worker is null || worker.OrganizationId != organizationId || !worker.IsActive)
        {
            throw new InvalidOperationException("El responsable no está activo en la organización.");
        }

        return worker;
    }

    private async Task<CachedProductionLine> RequireLineAsync(
        Guid lineId,
        Guid organizationId,
        Guid plantId,
        CancellationToken cancellationToken)
    {
        EnsureRequired(lineId, nameof(lineId));
        CachedProductionLine? line = await catalogs.FindLineAsync(lineId, cancellationToken)
            .ConfigureAwait(false);
        if (line is null || line.OrganizationId != organizationId || line.PlantId != plantId || !line.IsActive)
        {
            throw new InvalidOperationException("La línea no está activa en la planta.");
        }

        return line;
    }

    private async Task<LocalOperationalSession> RequireActiveSessionAsync(
        Guid stationId,
        Guid? lineId,
        CancellationToken cancellationToken)
    {
        EnsureRequired(stationId, nameof(stationId));
        if (lineId.HasValue)
        {
            EnsureRequired(lineId.Value, nameof(lineId));
        }

        LocalOperationalSession? session;
        if (lineId.HasValue)
        {
            session = await sessions.LoadAsync(stationId, lineId.Value, cancellationToken)
                .ConfigureAwait(false);
        }
        else
        {
            IReadOnlyList<LocalOperationalSession> active = await sessions
                .ListActiveAsync(stationId, cancellationToken)
                .ConfigureAwait(false);
            if (active.Count > 1)
            {
                throw new InvalidOperationException(
                    "Hay varias líneas activas; seleccione la línea antes de continuar.");
            }

            session = active.Count == 0 ? null : active[0];
        }
        if (session?.Status != LineFeedCycleStatus.Active)
        {
            throw new InvalidOperationException("La estación no tiene un cargamento activo con responsable.");
        }

        return session;
    }

    private static PendingOutboxMessage CreateOutbox(
        string operationType,
        Guid shipmentId,
        DateTimeOffset occurredAt,
        object payload,
        OperationAuthority authority) =>
        new(
            Guid.NewGuid(),
            operationType,
            "shipment",
            shipmentId,
            JsonSerializer.Serialize(payload, JsonOptions),
            occurredAt,
            authority.AuthorizationValidatedAt is null || authority.AuthorizationOfflineUntil is null
                ? null
                : new OutboxAuthorizationEvidence(
                    authority.ActorProfileId,
                    authority.PermissionVersion,
                    authority.AuthorizationValidatedAt.Value,
                    authority.AuthorizationOfflineUntil.Value,
                    authority.AuthorizationState));

    private void ValidateAuthority(OperationAuthority authority)
    {
        ArgumentNullException.ThrowIfNull(authority);
        EnsureRequired(authority.ActorProfileId, nameof(authority));
        EnsureRequired(authority.OrganizationId, nameof(authority));
        EnsureRequired(authority.PlantId, nameof(authority));
        EnsureRequired(authority.StationId, nameof(authority));
        if (authority.PermissionVersion < 1)
        {
            throw new ArgumentOutOfRangeException(
                nameof(authority),
                "La versión de autorización debe ser positiva.");
        }
        if (authority.AuthorizationState != "VALID" ||
            authority.AuthorizationOfflineUntil is DateTimeOffset offlineUntil &&
            offlineUntil <= timeProvider.GetUtcNow())
        {
            throw new UnauthorizedAccessException(
                "La autorización offline venció; las acciones de jefe de planta requieren reautenticación.");
        }
    }

    private static void EnsureAuthorityScope(
        OperationAuthority authority,
        Guid organizationId,
        Guid plantId,
        Guid stationId)
    {
        if (authority.OrganizationId != organizationId ||
            authority.PlantId != plantId ||
            authority.StationId != stationId)
        {
            throw new UnauthorizedAccessException("La autorización no corresponde al contexto operativo.");
        }
    }

    private static void EnsureRequired(Guid value, string parameterName)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("El UUID es obligatorio.", parameterName);
        }
    }
}
