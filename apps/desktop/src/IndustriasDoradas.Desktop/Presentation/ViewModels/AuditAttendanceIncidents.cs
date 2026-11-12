using System.Globalization;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain.Attendance;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public enum AuditIncidentState
{
    Open,
    Corrected,
    Resolved,
}

/// <summary>Incidencia de asistencia lista para mostrar en Auditoría.</summary>
public sealed record AuditAttendanceIncidentViewModel(
    Guid WorkerId,
    string WorkerName,
    string WorkerRole,
    AttendanceIncidentType Type,
    string TypeDescription,
    DateTimeOffset OccurredAt,
    string OccurredDescription,
    string ShiftDescription,
    string Description,
    AuditIncidentState State,
    string CorrectionDescription,
    string SupportDetail)
{
    public bool IsOpen => State == AuditIncidentState.Open;

    public string StatusDescription => State switch
    {
        AuditIncidentState.Open => "ABIERTA",
        AuditIncidentState.Corrected => "CORREGIDA",
        _ => "RESUELTA",
    };
}

/// <summary>
/// Obtiene las incidencias exclusivamente de <see cref="AttendanceProjectionService"/>.
/// Las abiertas son las de la proyección vigente. Las corregidas o resueltas son las que
/// la misma proyección detecta sobre las marcas originales (sin correcciones) y que
/// desaparecieron al aplicar las correcciones append-only. No se crean incidencias a
/// partir de marcas normales.
/// </summary>
public static class AuditAttendanceIncidents
{
    private static readonly TimeSpan CostaRicaOffset = TimeSpan.FromHours(-6);

    public static IReadOnlyList<AuditAttendanceIncidentViewModel> Build(
        LocalAttendanceWorkerAudit worker,
        DateTimeOffset now)
    {
        ArgumentNullException.ThrowIfNull(worker);
        if (worker.Events.Count == 0) return [];
        string role = worker.WorkerCategory == "JEFE_PLANTA" ? "Jefe de planta" : "Operario";
        AttendanceProjection current = AttendanceProjectionService.Project(worker.Events, now);
        AttendanceEvent[] originals = worker.Events.Where(item => !item.IsAdjustment).ToArray();
        AttendanceProjection original = originals.Length == 0
            ? new AttendanceProjection([], [])
            : AttendanceProjectionService.Project(originals, now);
        AttendanceEvent[] adjustments = worker.Events
            .Where(item => item.IsAdjustment)
            .OrderBy(item => item.RecordedAt)
            .ThenBy(item => item.ClientSequence)
            .ToArray();

        var items = new List<AuditAttendanceIncidentViewModel>();
        var seen = new HashSet<(AttendanceIncidentType, Guid)>();
        foreach (AttendanceIncident incident in current.Incidents)
        {
            if (!seen.Add((incident.Type, incident.EventId))) continue;
            AttendanceEvent? correction = adjustments.FirstOrDefault(item =>
                item.ClientEventId == incident.EventId);
            items.Add(Create(worker, role, incident, current, AuditIncidentState.Open, correction));
        }

        foreach (AttendanceIncident incident in original.Incidents)
        {
            if (!seen.Add((incident.Type, incident.EventId))) continue;
            AttendanceEvent? direct = adjustments.FirstOrDefault(item =>
                item.RelatedEventId == incident.EventId);
            AttendanceEvent? later = direct ?? adjustments.FirstOrDefault(item =>
                item.RecordedAt >= SourceEvent(worker, incident.EventId)?.RecordedAt);
            items.Add(Create(
                worker,
                role,
                incident,
                current,
                direct is null ? AuditIncidentState.Resolved : AuditIncidentState.Corrected,
                later));
        }

        return items;
    }

    private static AuditAttendanceIncidentViewModel Create(
        LocalAttendanceWorkerAudit worker,
        string role,
        AttendanceIncident incident,
        AttendanceProjection current,
        AuditIncidentState state,
        AttendanceEvent? correction)
    {
        AttendanceEvent? source = SourceEvent(worker, incident.EventId);
        DateTimeOffset occurredAt = source?.OccurredAt ?? incident.DetectedAt;
        Guid shiftAnchor = correction?.ClientEventId ?? incident.EventId;
        // Primero la jornada que contiene la marca; si no, la jornada vigente en ese
        // momento (por ejemplo, la que ya estaba abierta ante una entrada duplicada).
        AttendanceShift? shift = current.Shifts.FirstOrDefault(item =>
            item.CheckIn.ClientEventId == incident.EventId ||
            item.CheckOut?.ClientEventId == incident.EventId ||
            item.CheckIn.ClientEventId == shiftAnchor ||
            item.CheckOut?.ClientEventId == shiftAnchor) ??
            current.Shifts.FirstOrDefault(item =>
                item.CheckIn.OccurredAt <= occurredAt &&
                (item.CheckOut is null || item.CheckOut.OccurredAt >= occurredAt));
        return new AuditAttendanceIncidentViewModel(
            worker.WorkerId,
            worker.WorkerName,
            role,
            incident.Type,
            TypeDescription(incident.Type),
            occurredAt,
            Format(occurredAt),
            DescribeShift(shift),
            Explain(incident.Type, state),
            state,
            DescribeCorrection(worker, correction),
            $"Detalle para soporte: {incident.Type} · marca {incident.EventId:D}" +
            (source is null ? string.Empty : $" · {source.Type}"));
    }

    private static AttendanceEvent? SourceEvent(LocalAttendanceWorkerAudit worker, Guid eventId) =>
        worker.Events.FirstOrDefault(item => item.ClientEventId == eventId);

    public static string TypeDescription(AttendanceIncidentType type) => type switch
    {
        AttendanceIncidentType.DuplicateCheckIn => "Entrada duplicada",
        AttendanceIncidentType.CheckOutWithoutCheckIn => "Salida sin entrada",
        AttendanceIncidentType.OpenShiftExceeded => "Jornada abierta más de ocho horas",
        _ => "Incidencia de asistencia",
    };

    private static string Explain(AttendanceIncidentType type, AuditIncidentState state)
    {
        string description = type switch
        {
            AttendanceIncidentType.DuplicateCheckIn =>
                "Se marcó una entrada cuando ya había una jornada abierta; la segunda marca no abrió otra jornada.",
            AttendanceIncidentType.CheckOutWithoutCheckIn =>
                "Se marcó una salida sin que hubiera una entrada abierta.",
            AttendanceIncidentType.OpenShiftExceeded =>
                "La jornada lleva más de ocho horas abierta; falta registrar o corregir la salida.",
            _ => "Revise las marcas de esta persona.",
        };
        return state switch
        {
            AuditIncidentState.Corrected => $"{description} Ya se corrigió.",
            AuditIncidentState.Resolved => $"{description} Una corrección posterior la resolvió.",
            _ => description,
        };
    }

    private static string DescribeShift(AttendanceShift? shift)
    {
        if (shift is null) return "Sin jornada relacionada";
        string start = Format(shift.CheckIn.OccurredAt);
        return shift.CheckOut is null
            ? $"Jornada desde {start} · abierta"
            : $"Jornada {start} → {Format(shift.CheckOut.OccurredAt)}";
    }

    private static string DescribeCorrection(
        LocalAttendanceWorkerAudit worker,
        AttendanceEvent? correction)
    {
        if (correction is null) return "Sin corrección registrada";
        string actor = correction.CorrectedByProfileId is Guid profileId &&
            worker.CorrectorNames?.TryGetValue(profileId, out string? name) == true &&
            !string.IsNullOrWhiteSpace(name)
            ? name
            : "Jefe de planta";
        string kind = correction.Type == AttendanceEventType.AdjustedCheckOut
            ? "salida corregida"
            : "entrada corregida";
        string reason = string.IsNullOrWhiteSpace(correction.CorrectionReason)
            ? "sin motivo registrado"
            : correction.CorrectionReason;
        return $"Corrigió {actor} ({kind}, {Format(correction.OccurredAt)}) · Motivo: {reason}";
    }

    private static string Format(DateTimeOffset value) =>
        value.ToOffset(CostaRicaOffset).ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture);
}
