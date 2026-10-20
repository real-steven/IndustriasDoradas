namespace IndustriasDoradas.Desktop.Domain.Attendance;

public enum AttendanceShiftStatus
{
    Completed,
    Open,
}

public enum AttendanceIncidentType
{
    DuplicateCheckIn,
    CheckOutWithoutCheckIn,
    OpenShiftExceeded,
}

public sealed record AttendanceShift(
    Guid WorkerId,
    AttendanceEvent CheckIn,
    AttendanceEvent? CheckOut,
    DateOnly StartedOn,
    AttendanceShiftStatus Status)
{
    public TimeSpan? Duration => CheckOut is null
        ? null
        : CheckOut.OccurredAt - CheckIn.OccurredAt;
}

public sealed record AttendanceIncident(
    AttendanceIncidentType Type,
    Guid WorkerId,
    Guid EventId,
    DateTimeOffset DetectedAt,
    string Description);

public sealed record AttendanceProjection(
    IReadOnlyList<AttendanceShift> Shifts,
    IReadOnlyList<AttendanceIncident> Incidents);

public static class AttendanceProjectionService
{
    public static readonly TimeSpan ExpectedShiftDuration = TimeSpan.FromHours(8);

    private static readonly TimeZoneInfo CostaRicaTimeZone = TimeZoneInfo.CreateCustomTimeZone(
        "America/Costa_Rica",
        TimeSpan.FromHours(-6),
        "Costa Rica",
        "Costa Rica");

    public static AttendanceProjection Project(
        IEnumerable<AttendanceEvent> source,
        DateTimeOffset asOf)
    {
        ArgumentNullException.ThrowIfNull(source);
        AttendanceEvent[] events = Normalize(source);
        if (events.Length == 0)
        {
            return new AttendanceProjection([], []);
        }

        EnsureSingleWorkerScope(events);

        var shifts = new List<AttendanceShift>();
        var incidents = new List<AttendanceIncident>();
        AttendanceEvent? openCheckIn = null;

        foreach (AttendanceEvent attendanceEvent in events
                     .OrderBy(item => item.OccurredAt)
                     .ThenBy(item => item.ClientSequence))
        {
            if (attendanceEvent.IsCheckIn)
            {
                if (openCheckIn is null)
                {
                    openCheckIn = attendanceEvent;
                }
                else
                {
                    incidents.Add(new AttendanceIncident(
                        AttendanceIncidentType.DuplicateCheckIn,
                        attendanceEvent.WorkerId,
                        attendanceEvent.ClientEventId,
                        attendanceEvent.RecordedAt,
                        "Se registró una segunda entrada mientras existía una jornada abierta."));
                }

                continue;
            }

            if (openCheckIn is null)
            {
                incidents.Add(new AttendanceIncident(
                    AttendanceIncidentType.CheckOutWithoutCheckIn,
                    attendanceEvent.WorkerId,
                    attendanceEvent.ClientEventId,
                    attendanceEvent.RecordedAt,
                    "Se registró una salida sin una entrada abierta."));
                continue;
            }

            shifts.Add(CreateShift(openCheckIn, attendanceEvent, AttendanceShiftStatus.Completed));
            openCheckIn = null;
        }

        if (openCheckIn is not null)
        {
            shifts.Add(CreateShift(openCheckIn, null, AttendanceShiftStatus.Open));
            DateTimeOffset normalizedAsOf = asOf.ToUniversalTime();
            if (normalizedAsOf - openCheckIn.OccurredAt > ExpectedShiftDuration)
            {
                incidents.Add(new AttendanceIncident(
                    AttendanceIncidentType.OpenShiftExceeded,
                    openCheckIn.WorkerId,
                    openCheckIn.ClientEventId,
                    normalizedAsOf,
                    "La jornada continúa abierta después de ocho horas."));
            }
        }

        return new AttendanceProjection(shifts.AsReadOnly(), incidents.AsReadOnly());
    }

    private static AttendanceShift CreateShift(
        AttendanceEvent checkIn,
        AttendanceEvent? checkOut,
        AttendanceShiftStatus status)
    {
        DateTimeOffset localStart = TimeZoneInfo.ConvertTime(checkIn.OccurredAt, CostaRicaTimeZone);
        return new AttendanceShift(
            checkIn.WorkerId,
            checkIn,
            checkOut,
            DateOnly.FromDateTime(localStart.DateTime),
            status);
    }

    private static AttendanceEvent[] Normalize(IEnumerable<AttendanceEvent> source)
    {
        var byId = new Dictionary<Guid, AttendanceEvent>();
        var bySequence = new Dictionary<(Guid StationId, long Sequence), AttendanceEvent>();
        foreach (AttendanceEvent attendanceEvent in source)
        {
            if (byId.TryGetValue(attendanceEvent.ClientEventId, out AttendanceEvent? existingById))
            {
                if (existingById != attendanceEvent)
                {
                    throw new InvalidOperationException(
                        "El mismo UUID de asistencia contiene datos diferentes.");
                }

                continue;
            }

            var sequenceKey = (attendanceEvent.StationId, attendanceEvent.ClientSequence);
            if (bySequence.TryGetValue(sequenceKey, out AttendanceEvent? existingBySequence) &&
                existingBySequence.ClientEventId != attendanceEvent.ClientEventId)
            {
                throw new InvalidOperationException(
                    "Una estación no puede reutilizar la misma secuencia de asistencia.");
            }

            byId.Add(attendanceEvent.ClientEventId, attendanceEvent);
            bySequence[sequenceKey] = attendanceEvent;
        }

        return [.. byId.Values];
    }

    private static void EnsureSingleWorkerScope(AttendanceEvent[] events)
    {
        AttendanceEvent first = events[0];
        if (events.Any(item =>
                item.OrganizationId != first.OrganizationId ||
                item.PlantId != first.PlantId ||
                item.WorkerId != first.WorkerId))
        {
            throw new InvalidOperationException(
                "Una proyección de asistencia no puede mezclar trabajadores, plantas u organizaciones.");
        }
    }
}
