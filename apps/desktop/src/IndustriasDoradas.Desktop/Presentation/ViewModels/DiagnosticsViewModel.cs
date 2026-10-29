using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using IndustriasDoradas.Desktop.Configuration;
using System.ComponentModel;
using System.Diagnostics;
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
    private readonly string supportFolderPath;
    private readonly SynchronizationContext? uiContext;
    private HealthState state = HealthState.NotChecked;
    private string statusTitle = "Sin comprobar";
    private string statusMessage = "Compruebe la conexión con el sistema central.";
    private string service = "—";
    private string lastChecked = "—";
    private LocalDatabaseHealthState localState = LocalDatabaseHealthState.Unavailable;
    private string localStatusTitle = "Sin comprobar";
    private string localStatusMessage = "Compruebe los datos guardados en este equipo antes de operar.";
    private string localRecoveryInstruction = "—";
    private string pendingOperations = "—";
    private string availableSpace = "—";
    private string localLastChecked = "—";
    private string recoveryCopyStatus = "No se ha creado un respaldo de la estación.";
    private string networkStatus = "Sin comprobar";
    private string lastSynchronization = "—";
    private string clockDeviation = "—";
    private string diagnosticReportStatus = "No se ha generado un informe para soporte.";
    private string supportFolderStatus = "Los respaldos e informes se guardan en la carpeta de soporte.";
    private IReadOnlyList<SyncFailureDiagnostic> failures = [];
    private IReadOnlyList<AdministrativeCorrectionDiagnostic> corrections = [];
    private int failedReviewCount;
    private int pullReviewCount;
    private bool isCreatingCopy;
    private bool isExportingReport;
    private readonly string stationCode;
    private readonly string stationName;
    private readonly StationViewModel? stationViewModel;
    private readonly string applicationVersion = DesktopApplicationInfo.Version;

    public DiagnosticsViewModel(
        IHealthService healthService,
        ILocalDatabaseDiagnostics localDiagnostics,
        IOptions<StationOptions> stationOptions,
        ISyncStatusNotifier statusNotifier)
        : this(healthService, localDiagnostics, stationOptions, statusNotifier, null)
    {
    }

    public DiagnosticsViewModel(
        IHealthService healthService,
        ILocalDatabaseDiagnostics localDiagnostics,
        IOptions<StationOptions> stationOptions,
        ISyncStatusNotifier statusNotifier,
        StationViewModel? stationViewModel)
    {
        this.healthService = healthService;
        this.localDiagnostics = localDiagnostics;
        supportFolderPath = GetSupportFolderPath();
        uiContext = SynchronizationContext.Current;
        this.stationViewModel = stationViewModel;
        StationOptions configuredStation = stationOptions.Value;
        stationCode = configuredStation.Id == Guid.Empty
            ? "No configurado"
            : configuredStation.Id.ToString("D");
        stationName = string.IsNullOrWhiteSpace(configuredStation.Name)
            ? "Estación Avangares"
            : configuredStation.Name.Trim();
        RefreshCommand = new AsyncRelayCommand(RefreshAsync);
        CreateRecoveryCopyCommand = new AsyncRelayCommand(
            CreateRecoveryCopyAsync,
            () => CanUseProtectedActions && !IsCreatingCopy &&
                LocalState != LocalDatabaseHealthState.Unavailable);
        ExportDiagnosticReportCommand = new AsyncRelayCommand(
            ExportDiagnosticReportAsync,
            () => CanUseProtectedActions && !IsExportingReport);
        OpenSupportFolderCommand = new RelayCommand(
            OpenSupportFolder,
            () => CanUseProtectedActions);
        statusNotifier.Changed += OnSyncStatusChanged;
        if (stationViewModel is not null)
        {
            stationViewModel.PropertyChanged += OnStationPropertyChanged;
        }
    }

    public DiagnosticsViewModel(
        IHealthService healthService,
        ILocalDatabaseDiagnostics localDiagnostics,
        IOptions<StationOptions> stationOptions)
        : this(healthService, localDiagnostics, stationOptions, new SyncStatusNotifier())
    {
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
    public IRelayCommand OpenSupportFolderCommand { get; }
    public string Station => stationCode;
    public string StationCode => stationCode;
    public string StationName => stationName;
    public string ApplicationVersion => applicationVersion;
    public string NetworkStatus { get => networkStatus; private set => SetProperty(ref networkStatus, value); }
    public string LastSynchronization { get => lastSynchronization; private set => SetProperty(ref lastSynchronization, value); }
    public string ClockDeviation { get => clockDeviation; private set => SetProperty(ref clockDeviation, value); }
    public string DiagnosticReportStatus { get => diagnosticReportStatus; private set => SetProperty(ref diagnosticReportStatus, value); }
    public string SupportFolderPath => supportFolderPath;
    public string SupportFolderStatus { get => supportFolderStatus; private set => SetProperty(ref supportFolderStatus, value); }
    public IReadOnlyList<SyncFailureDiagnostic> Failures { get => failures; private set => SetProperty(ref failures, value); }
    public int FailedReviewCount
    {
        get => failedReviewCount;
        private set => SetProperty(ref failedReviewCount, value);
    }
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
    public bool CanUseProtectedActions => stationViewModel?.IsPlantManager ?? true;
    public string CorrectionNotification => HasCorrections
        ? "Corrección disponible en auditoría."
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
        StatusMessage = "Buscando conexión con el sistema central.";

        Task<SystemHealth> apiTask = healthService.CheckAsync(cancellationToken);
        Task<LocalDatabaseHealth> localTask = localDiagnostics.InspectAsync(cancellationToken);
        await Task.WhenAll(apiTask, localTask).ConfigureAwait(true);
        SystemHealth result = await apiTask.ConfigureAwait(true);

        State = result.State;
        StatusTitle = result.State == HealthState.Available
            ? "Conectado y disponible"
            : "Sin conexión con el sistema central";
        StatusMessage = result.State == HealthState.Available
            ? "El sistema central respondió correctamente."
            : "No se pudo conectar con el sistema central. Puede continuar con los datos guardados en este equipo.";
        Service = result.Service;
        NetworkStatus = result.State == HealthState.Available
            ? "Sistema central disponible"
            : "Sin conexión con el sistema central";
        LastChecked = result.CheckedAt?.ToLocalTime().ToString(
            "g",
            CultureInfo.CurrentCulture) ?? "—";

        LocalDatabaseHealth local = await localTask.ConfigureAwait(true);
        LocalState = local.State;
        LocalStatusTitle = local.State switch
        {
            LocalDatabaseHealthState.Healthy => "Datos disponibles en este equipo",
            LocalDatabaseHealthState.Attention => "Los datos requieren atención",
            _ => "Datos del equipo no disponibles",
        };
        LocalStatusMessage = local.State == LocalDatabaseHealthState.Healthy
            ? "Los datos están guardados y disponibles en este equipo."
            : local.Summary;
        int pendingSynchronization = checked(local.PendingOutboxCount + local.FailedReviewOutboxCount);
        LocalRecoveryInstruction = local.State == LocalDatabaseHealthState.Healthy
            ? pendingSynchronization == 0
                ? "Todos los datos de este equipo están sincronizados."
                : "Los datos pendientes están guardados y se enviarán automáticamente al recuperar la conexión."
            : local.RecoveryInstruction;
        PendingOperations = $"{pendingSynchronization} pendientes · " +
            $"{local.SyncedOutboxCount} sincronizados";
        AvailableSpace = local.AvailableFreeBytes < 0
            ? "No disponible"
            : FormatBytes(local.AvailableFreeBytes);
        LocalLastChecked = local.CheckedAt.ToLocalTime().ToString("g", CultureInfo.CurrentCulture);
        NetworkStatus = local.SyncNetworkState switch
        {
            "AVAILABLE" => "Sistema central disponible",
            "UNAVAILABLE" => "Sin conexión con el sistema central",
            _ when result.State == HealthState.Available => "Conexión disponible · sincronización aún no comprobada",
            _ => "Sin conexión con el sistema central",
        };
        LastSynchronization = local.LastSynchronizationAt?.ToLocalTime().ToString(
            "g", CultureInfo.CurrentCulture) ?? "Aún no registrada";
        ClockDeviation = FormatClockDeviation(local.ClockDeviationSeconds);
        Failures = local.Failures ?? [];
        FailedReviewCount = local.FailedReviewOutboxCount;
        Corrections = local.Corrections ?? [];
        PullReviewCount = local.PullReviewCount;
    }

    private async Task ExportDiagnosticReportAsync()
    {
        IsExportingReport = true;
        try
        {
            string directory = Path.Combine(
                SupportFolderPath,
                "Diagnostico");
            Directory.CreateDirectory(directory);
            string path = Path.Combine(directory,
                $"informe-soporte-{DateTimeOffset.Now:yyyyMMdd-HHmmss}.json");
            var report = new
            {
                generatedAtUtc = DateTimeOffset.UtcNow,
                station = new
                {
                    name = StationName,
                    code = StationCode,
                },
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
            DiagnosticReportStatus = $"Informe para soporte generado: {path}";
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            DiagnosticReportStatus = "No se pudo generar el informe para soporte en Documentos.";
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

    private void OnSyncStatusChanged(object? sender, SyncStatusNotification notification)
    {
        if (uiContext is null)
        {
            _ = RefreshAfterNotificationAsync();
            return;
        }
        uiContext.Post(static state =>
        {
            _ = ((DiagnosticsViewModel)state!).RefreshAfterNotificationAsync();
        }, this);
    }

    private async Task RefreshAfterNotificationAsync()
    {
        try
        {
            await RefreshAsync().ConfigureAwait(true);
        }
        catch (Exception exception) when (exception is IOException or InvalidOperationException)
        {
            // El siguiente refresco manual vuelve a consultar el estado sin interrumpir la operación.
        }
    }

    private async Task CreateRecoveryCopyAsync()
    {
        IsCreatingCopy = true;
        try
        {
            string directory = Path.Combine(SupportFolderPath, "Recuperacion");
            string path = await localDiagnostics.CreateConsistentCopyAsync(directory).ConfigureAwait(true);
            RecoveryCopyStatus = $"Respaldo de la estación creado: {path}";
        }
        catch (Exception exception) when (exception is IOException or InvalidOperationException)
        {
            RecoveryCopyStatus = "No se pudo crear el respaldo. Conserve los datos actuales y solicite soporte.";
        }
        finally
        {
            IsCreatingCopy = false;
        }
    }

    private void OpenSupportFolder()
    {
        string directory = SupportFolderPath;
        try
        {
            Directory.CreateDirectory(Path.Combine(directory, "Recuperacion"));
            Directory.CreateDirectory(Path.Combine(directory, "Diagnostico"));
            Process.Start(new ProcessStartInfo
            {
                FileName = directory,
                UseShellExecute = true,
            });
            SupportFolderStatus = $"Carpeta de soporte abierta: {directory}";
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or Win32Exception)
        {
            SupportFolderStatus = $"No se pudo abrir la carpeta de soporte: {directory}";
        }
    }

    private static string GetSupportFolderPath() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
        "IndustriasDoradas");

    private static string FormatBytes(long bytes)
    {
        const double gigabyte = 1024d * 1024d * 1024d;
        const double megabyte = 1024d * 1024d;
        return bytes >= gigabyte
            ? $"{bytes / gigabyte:0.0} GB libres"
            : $"{bytes / megabyte:0} MB libres";
    }

    private void OnStationPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName != nameof(StationViewModel.Mode)) return;
        OnPropertyChanged(nameof(CanUseProtectedActions));
        CreateRecoveryCopyCommand.NotifyCanExecuteChanged();
        ExportDiagnosticReportCommand.NotifyCanExecuteChanged();
        OpenSupportFolderCommand.NotifyCanExecuteChanged();
    }
}
