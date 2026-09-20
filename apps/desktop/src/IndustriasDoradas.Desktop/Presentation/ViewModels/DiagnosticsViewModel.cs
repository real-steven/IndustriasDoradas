using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Configuration;
using System.Globalization;
using System.IO;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed class DiagnosticsViewModel : ObservableObject
{
    private static readonly JsonSerializerOptions DiagnosticJsonOptions = new() { WriteIndented = true };
    private readonly IHealthService healthService;
    private readonly ILocalDatabaseDiagnostics localDiagnostics;
    private HealthState state = HealthState.NotChecked;
    private string statusTitle = "Sin comprobar";
    private string statusMessage = "Ejecuta la comprobación para consultar la API.";
    private string service = "—";
    private string lastChecked = "—";
    private LocalDatabaseHealthState localState = LocalDatabaseHealthState.Unavailable;
    private string localStatusTitle = "Sin comprobar";
    private string localStatusMessage = "Comprueba el almacenamiento local antes de operar.";
    private string localRecoveryInstruction = "—";
    private string pendingOperations = "—";
    private string availableSpace = "—";
    private string localLastChecked = "—";
    private string recoveryCopyStatus = "No se ha creado una copia de recuperación.";
    private string networkStatus = "Sin comprobar";
    private string lastSynchronization = "—";
    private string clockDeviation = "—";
    private string diagnosticReportStatus = "No se ha exportado un diagnóstico.";
    private IReadOnlyList<SyncFailureDiagnostic> failures = [];
    private IReadOnlyList<AdministrativeCorrectionDiagnostic> corrections = [];
    private int pullReviewCount;
    private bool isCreatingCopy;
    private bool isExportingReport;
    private readonly string station;
    private readonly string applicationVersion = DesktopApplicationInfo.Version;

    public DiagnosticsViewModel(
        IHealthService healthService,
        ILocalDatabaseDiagnostics localDiagnostics,
        IOptions<StationOptions> stationOptions)
    {
        this.healthService = healthService;
        this.localDiagnostics = localDiagnostics;
        station = stationOptions.Value.Id == Guid.Empty ? "No configurada" : stationOptions.Value.Id.ToString("D");
        RefreshCommand = new AsyncRelayCommand(RefreshAsync);
        CreateRecoveryCopyCommand = new AsyncRelayCommand(
            CreateRecoveryCopyAsync,
            () => !IsCreatingCopy && LocalState != LocalDatabaseHealthState.Unavailable);
        ExportDiagnosticReportCommand = new AsyncRelayCommand(
            ExportDiagnosticReportAsync,
            () => !IsExportingReport);
    }

    public DiagnosticsViewModel(IHealthService healthService, ILocalDatabaseDiagnostics localDiagnostics)
        : this(healthService, localDiagnostics, Options.Create(new StationOptions()))
    {
    }

    public HealthState State
    {
        get => state;
        private set => SetProperty(ref state, value);
    }

    public string StatusTitle
    {
        get => statusTitle;
        private set => SetProperty(ref statusTitle, value);
    }

    public string StatusMessage
    {
        get => statusMessage;
        private set => SetProperty(ref statusMessage, value);
    }

    public string Service
    {
        get => service;
        private set => SetProperty(ref service, value);
    }

    public string LastChecked
    {
        get => lastChecked;
        private set => SetProperty(ref lastChecked, value);
    }

    public IAsyncRelayCommand RefreshCommand { get; }
    public IAsyncRelayCommand CreateRecoveryCopyCommand { get; }
    public IAsyncRelayCommand ExportDiagnosticReportCommand { get; }
    public string Station => station;
    public string ApplicationVersion => applicationVersion;
    public string NetworkStatus { get => networkStatus; private set => SetProperty(ref networkStatus, value); }
    public string LastSynchronization { get => lastSynchronization; private set => SetProperty(ref lastSynchronization, value); }
    public string ClockDeviation { get => clockDeviation; private set => SetProperty(ref clockDeviation, value); }
    public string DiagnosticReportStatus { get => diagnosticReportStatus; private set => SetProperty(ref diagnosticReportStatus, value); }
    public IReadOnlyList<SyncFailureDiagnostic> Failures { get => failures; private set => SetProperty(ref failures, value); }
    public IReadOnlyList<AdministrativeCorrectionDiagnostic> Corrections
    {
        get => corrections;
        private set
        {
            if (SetProperty(ref corrections, value))
            {
                OnPropertyChanged(nameof(HasCorrections));
                OnPropertyChanged(nameof(CorrectionNotification));
            }
        }
    }
    public int PullReviewCount { get => pullReviewCount; private set => SetProperty(ref pullReviewCount, value); }
    public bool HasCorrections => Corrections.Count > 0;
    public string CorrectionNotification => HasCorrections
        ? $"{Corrections.Count} corrección(es) administrativa(s) recibida(s). Abrir auditoría."
        : string.Empty;
    public LocalDatabaseHealthState LocalState
    {
        get => localState;
        private set
        {
            if (SetProperty(ref localState, value)) CreateRecoveryCopyCommand.NotifyCanExecuteChanged();
        }
    }
    public string LocalStatusTitle { get => localStatusTitle; private set => SetProperty(ref localStatusTitle, value); }
    public string LocalStatusMessage { get => localStatusMessage; private set => SetProperty(ref localStatusMessage, value); }
    public string LocalRecoveryInstruction { get => localRecoveryInstruction; private set => SetProperty(ref localRecoveryInstruction, value); }
    public string PendingOperations { get => pendingOperations; private set => SetProperty(ref pendingOperations, value); }
    public string AvailableSpace { get => availableSpace; private set => SetProperty(ref availableSpace, value); }
    public string LocalLastChecked { get => localLastChecked; private set => SetProperty(ref localLastChecked, value); }
    public string RecoveryCopyStatus { get => recoveryCopyStatus; private set => SetProperty(ref recoveryCopyStatus, value); }
    public bool IsCreatingCopy
    {
        get => isCreatingCopy;
        private set
        {
            if (SetProperty(ref isCreatingCopy, value)) CreateRecoveryCopyCommand.NotifyCanExecuteChanged();
        }
    }
    public bool IsExportingReport
    {
        get => isExportingReport;
        private set
        {
            if (SetProperty(ref isExportingReport, value)) ExportDiagnosticReportCommand.NotifyCanExecuteChanged();
        }
    }

    public async Task RefreshAsync(CancellationToken cancellationToken = default)
    {
        State = HealthState.Checking;
        StatusTitle = "Comprobando conexión";
        StatusMessage = "Consultando el endpoint técnico de la API.";

        Task<SystemHealth> apiTask = healthService.CheckAsync(cancellationToken);
        Task<LocalDatabaseHealth> localTask = localDiagnostics.InspectAsync(cancellationToken);
        await Task.WhenAll(apiTask, localTask).ConfigureAwait(true);
        SystemHealth result = await apiTask.ConfigureAwait(true);

        State = result.State;
        StatusTitle = result.State == HealthState.Available
            ? "API disponible"
            : "API no disponible";
        StatusMessage = result.Detail;
        Service = result.Service;
        NetworkStatus = result.State == HealthState.Available ? "Conexión disponible" : "Sin conexión con la API";
        LastChecked = result.CheckedAt?.ToLocalTime().ToString(
            "g",
            CultureInfo.CurrentCulture) ?? "—";

        LocalDatabaseHealth local = await localTask.ConfigureAwait(true);
        LocalState = local.State;
        LocalStatusTitle = local.State switch
        {
            LocalDatabaseHealthState.Healthy => "Guardado local disponible",
            LocalDatabaseHealthState.Attention => "Guardado local requiere atención",
            _ => "Guardado local no disponible",
        };
        LocalStatusMessage = local.Summary;
        LocalRecoveryInstruction = local.RecoveryInstruction;
        PendingOperations = $"{local.PendingOutboxCount} pendientes · " +
            $"{local.FailedReviewOutboxCount} requieren revisión · " +
            $"{local.SyncedOutboxCount} sincronizados";
        AvailableSpace = local.AvailableFreeBytes < 0
            ? "No disponible"
            : FormatBytes(local.AvailableFreeBytes);
        LocalLastChecked = local.CheckedAt.ToLocalTime().ToString("g", CultureInfo.CurrentCulture);
        LastSynchronization = local.LastSynchronizationAt?.ToLocalTime().ToString(
            "g", CultureInfo.CurrentCulture) ?? "Aún no registrada";
        ClockDeviation = FormatClockDeviation(local.ClockDeviationSeconds);
        Failures = local.Failures ?? [];
        Corrections = local.Corrections ?? [];
        PullReviewCount = local.PullReviewCount;
    }

    private async Task ExportDiagnosticReportAsync()
    {
        IsExportingReport = true;
        try
        {
            string directory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
                "IndustriasDoradas",
                "Diagnostico");
            Directory.CreateDirectory(directory);
            string path = Path.Combine(directory,
                $"diagnostico-sprint-3-{DateTimeOffset.Now:yyyyMMdd-HHmmss}.json");
            var report = new
            {
                generatedAtUtc = DateTimeOffset.UtcNow,
                station = Station,
                applicationVersion = ApplicationVersion,
                network = NetworkStatus,
                lastSynchronization = LastSynchronization,
                clockDeviation = ClockDeviation,
                localState = LocalState.ToString(),
                outbox = PendingOperations,
                pullReviews = PullReviewCount,
                failures = Failures.Select(item => new
                {
                    item.OperationType,
                    item.ErrorCode,
                    item.Cause,
                    item.AttemptCount,
                    item.OccurredAt,
                    item.LastAttemptAt,
                }),
                corrections = Corrections.Select(item => new
                {
                    item.Administrator,
                    item.RoleCode,
                    item.Reason,
                    item.Action,
                    item.EntityType,
                    item.OccurredAt,
                    item.Changes,
                }),
            };
            await File.WriteAllTextAsync(path, JsonSerializer.Serialize(report, DiagnosticJsonOptions))
                .ConfigureAwait(true);
            DiagnosticReportStatus = $"Diagnóstico sin secretos exportado: {path}";
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            DiagnosticReportStatus = "No se pudo exportar el diagnóstico en Documentos.";
        }
        finally
        {
            IsExportingReport = false;
        }
    }

    private static string FormatClockDeviation(double? seconds)
    {
        if (seconds is null) return "Aún no medida";
        double rounded = Math.Round(seconds.Value);
        return Math.Abs(rounded) <= 5
            ? $"{rounded:+0;-0;0} s · dentro del margen"
            : $"{rounded:+0;-0;0} s · revisar reloj del equipo";
    }

    private async Task CreateRecoveryCopyAsync()
    {
        IsCreatingCopy = true;
        try
        {
            string documents = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            string directory = Path.Combine(documents, "IndustriasDoradas", "Recuperacion");
            string path = await localDiagnostics.CreateConsistentCopyAsync(directory).ConfigureAwait(true);
            RecoveryCopyStatus = $"Copia consistente creada: {path}";
        }
        catch (Exception exception) when (exception is IOException or InvalidOperationException)
        {
            RecoveryCopyStatus = "No se pudo crear la copia. Conserve la base actual y solicite diagnóstico.";
        }
        finally
        {
            IsCreatingCopy = false;
        }
    }

    private static string FormatBytes(long bytes)
    {
        const double gigabyte = 1024d * 1024d * 1024d;
        const double megabyte = 1024d * 1024d;
        return bytes >= gigabyte
            ? $"{bytes / gigabyte:0.0} GB libres"
            : $"{bytes / megabyte:0} MB libres";
    }
}
