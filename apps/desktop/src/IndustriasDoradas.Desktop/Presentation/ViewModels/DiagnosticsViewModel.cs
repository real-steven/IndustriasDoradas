using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using System.Globalization;
using System.IO;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed class DiagnosticsViewModel : ObservableObject
{
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
    private bool isCreatingCopy;

    public DiagnosticsViewModel(
        IHealthService healthService,
        ILocalDatabaseDiagnostics localDiagnostics)
    {
        this.healthService = healthService;
        this.localDiagnostics = localDiagnostics;
        RefreshCommand = new AsyncRelayCommand(RefreshAsync);
        CreateRecoveryCopyCommand = new AsyncRelayCommand(
            CreateRecoveryCopyAsync,
            () => !IsCreatingCopy && LocalState != LocalDatabaseHealthState.Unavailable);
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
        PendingOperations = local.PendingOutboxCount == 1
            ? "1 pendiente conservado"
            : $"{local.PendingOutboxCount} pendientes conservados";
        AvailableSpace = local.AvailableFreeBytes < 0
            ? "No disponible"
            : FormatBytes(local.AvailableFreeBytes);
        LocalLastChecked = local.CheckedAt.ToLocalTime().ToString("g", CultureInfo.CurrentCulture);
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
