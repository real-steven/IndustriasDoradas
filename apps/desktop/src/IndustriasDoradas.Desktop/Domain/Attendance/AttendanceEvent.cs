namespace IndustriasDoradas.Desktop.Domain.Attendance;

public enum AttendanceEventType
{
    CheckIn,
    CheckOut,
    AdjustedCheckIn,
    AdjustedCheckOut,
}

public enum AttendanceSyncStatus
{
    Pending,
    Synchronized,
    RequiresAttention,
}

public sealed record AttendanceEvent
{
    private AttendanceEvent(
        Guid clientEventId,
        Guid organizationId,
        Guid plantId,
        Guid stationId,
        Guid workerId,
        AttendanceEventType type,
        long clientSequence,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt,
        DateTimeOffset? confirmedAt,
        AttendanceSyncStatus syncStatus,
        Guid? correctedByProfileId,
        string? correctionReason,
        Guid? relatedEventId)
    {
        EnsureRequired(clientEventId, nameof(clientEventId));
        EnsureRequired(organizationId, nameof(organizationId));
        EnsureRequired(plantId, nameof(plantId));
        EnsureRequired(stationId, nameof(stationId));
        EnsureRequired(workerId, nameof(workerId));
        if (clientSequence <= 0)
        {
            throw new ArgumentOutOfRangeException(
                nameof(clientSequence),
                "La secuencia cliente debe ser mayor que cero.");
        }

        bool isAdjustment = type is AttendanceEventType.AdjustedCheckIn or
            AttendanceEventType.AdjustedCheckOut;
        if (isAdjustment)
        {
            if (correctedByProfileId is null || correctedByProfileId == Guid.Empty)
            {
                throw new ArgumentException(
                    "Un ajuste requiere el perfil del jefe de planta.",
                    nameof(correctedByProfileId));
            }

            if (string.IsNullOrWhiteSpace(correctionReason))
            {
                throw new ArgumentException(
                    "Un ajuste requiere un motivo.",
                    nameof(correctionReason));
            }

            if (relatedEventId is null || relatedEventId == Guid.Empty)
            {
                throw new ArgumentException(
                    "Un ajuste debe relacionarse con la marca que corrige.",
                    nameof(relatedEventId));
            }
        }
        else if (correctedByProfileId is not null || correctionReason is not null || relatedEventId is not null)
        {
            throw new ArgumentException(
                "Una marca ordinaria no puede contener datos de corrección.",
                nameof(correctedByProfileId));
        }

        DateTimeOffset? normalizedConfirmedAt = confirmedAt?.ToUniversalTime();
        if (syncStatus == AttendanceSyncStatus.Synchronized && normalizedConfirmedAt is null)
        {
            throw new ArgumentException(
                "Un evento sincronizado requiere hora de confirmación.",
                nameof(confirmedAt));
        }

        ClientEventId = clientEventId;
        OrganizationId = organizationId;
        PlantId = plantId;
        StationId = stationId;
        WorkerId = workerId;
        Type = type;
        ClientSequence = clientSequence;
        OccurredAt = occurredAt.ToUniversalTime();
        RecordedAt = recordedAt.ToUniversalTime();
        ConfirmedAt = normalizedConfirmedAt;
        SyncStatus = syncStatus;
        CorrectedByProfileId = correctedByProfileId;
        CorrectionReason = correctionReason?.Trim();
        RelatedEventId = relatedEventId;
    }

    public Guid ClientEventId { get; }

    public Guid OrganizationId { get; }

    public Guid PlantId { get; }

    public Guid StationId { get; }

    public Guid WorkerId { get; }

    public AttendanceEventType Type { get; }

    public long ClientSequence { get; }

    public DateTimeOffset OccurredAt { get; }

    public DateTimeOffset RecordedAt { get; }

    public DateTimeOffset? ConfirmedAt { get; }

    public AttendanceSyncStatus SyncStatus { get; }

    public Guid? CorrectedByProfileId { get; }

    public string? CorrectionReason { get; }

    public Guid? RelatedEventId { get; }

    public bool IsAdjustment => Type is AttendanceEventType.AdjustedCheckIn or
        AttendanceEventType.AdjustedCheckOut;

    public bool IsCheckIn => Type is AttendanceEventType.CheckIn or
        AttendanceEventType.AdjustedCheckIn;

    public static AttendanceEvent CheckIn(
        Guid clientEventId,
        Guid organizationId,
        Guid plantId,
        Guid stationId,
        Guid workerId,
        long clientSequence,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt) =>
        CreateOrdinary(
            clientEventId,
            organizationId,
            plantId,
            stationId,
            workerId,
            AttendanceEventType.CheckIn,
            clientSequence,
            occurredAt,
            recordedAt);

    public static AttendanceEvent CheckOut(
        Guid clientEventId,
        Guid organizationId,
        Guid plantId,
        Guid stationId,
        Guid workerId,
        long clientSequence,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt) =>
        CreateOrdinary(
            clientEventId,
            organizationId,
            plantId,
            stationId,
            workerId,
            AttendanceEventType.CheckOut,
            clientSequence,
            occurredAt,
            recordedAt);

    public static AttendanceEvent Adjustment(
        Guid clientEventId,
        Guid organizationId,
        Guid plantId,
        Guid stationId,
        Guid workerId,
        AttendanceEventType type,
        long clientSequence,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt,
        Guid correctedByProfileId,
        string reason,
        Guid relatedEventId) =>
        new(
            clientEventId,
            organizationId,
            plantId,
            stationId,
            workerId,
            type,
            clientSequence,
            occurredAt,
            recordedAt,
            null,
            AttendanceSyncStatus.Pending,
            correctedByProfileId,
            reason,
            relatedEventId);

    public static AttendanceEvent Restore(
        Guid clientEventId,
        Guid organizationId,
        Guid plantId,
        Guid stationId,
        Guid workerId,
        AttendanceEventType type,
        long clientSequence,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt,
        DateTimeOffset? confirmedAt,
        AttendanceSyncStatus syncStatus,
        Guid? correctedByProfileId = null,
        string? correctionReason = null,
        Guid? relatedEventId = null) =>
        new(
            clientEventId,
            organizationId,
            plantId,
            stationId,
            workerId,
            type,
            clientSequence,
            occurredAt,
            recordedAt,
            confirmedAt,
            syncStatus,
            correctedByProfileId,
            correctionReason,
            relatedEventId);

    private static AttendanceEvent CreateOrdinary(
        Guid clientEventId,
        Guid organizationId,
        Guid plantId,
        Guid stationId,
        Guid workerId,
        AttendanceEventType type,
        long clientSequence,
        DateTimeOffset occurredAt,
        DateTimeOffset recordedAt) =>
        new(
            clientEventId,
            organizationId,
            plantId,
            stationId,
            workerId,
            type,
            clientSequence,
            occurredAt,
            recordedAt,
            null,
            AttendanceSyncStatus.Pending,
            null,
            null,
            null);

    private static void EnsureRequired(Guid value, string parameterName)
    {
        if (value == Guid.Empty)
        {
            throw new ArgumentException("El identificador es obligatorio.", parameterName);
        }
    }
}
