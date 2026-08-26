using System.Globalization;
using System.IO;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain.Production;
using Microsoft.Extensions.Options;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed class OperationViewModel : ObservableObject
{
    private static readonly TimeSpan CostaRicaOffset = TimeSpan.FromHours(-6);
    private readonly ILocalOperationDashboardRepository dashboard;
    private readonly RegisterCajuelaHandler registerHandler;
    private readonly RevertLastCajuelaHandler reversalHandler;
    private readonly TimeProvider timeProvider;
    private readonly Guid stationId;
    private PreparedCajuelaReversal? preparedReversal;
    private string localStorageStatus = "Preparando almacenamiento local…";
    private string pendingStatus = "Pendientes por enviar: —";
    private string lastResult = "Esperando una operación.";
    private string correctionSummary = string.Empty;
    private bool isBusy;
    private bool isCorrectionPending;
    private bool isLocalStorageAvailable;

    public OperationViewModel(
        ILocalOperationDashboardRepository dashboard,
        RegisterCajuelaHandler registerHandler,
        RevertLastCajuelaHandler reversalHandler,
        IOptions<StationOptions> stationOptions,
        TimeProvider timeProvider)
    {
        this.dashboard = dashboard;
        this.registerHandler = registerHandler;
        this.reversalHandler = reversalHandler;
        this.timeProvider = timeProvider;
        stationId = stationOptions.Value.Id;
        RegisterCajuelaCommand = new AsyncRelayCommand(RegisterCajuelaAsync, CanRegisterCajuela);
        PrepareCorrectionCommand = new AsyncRelayCommand(PrepareCorrectionAsync, CanPrepareCorrection);
        ConfirmCorrectionCommand = new AsyncRelayCommand(ConfirmCorrectionAsync, CanConfirmCorrection);
        CancelCorrectionCommand = new RelayCommand(CancelCorrection, () => IsCorrectionPending && !IsBusy);
        RefreshCommand = new AsyncRelayCommand(RefreshAsync, () => !IsBusy);
    }

    public OperationLinePanelViewModel Line { get; } = new();
    public string LocalStorageStatus
    {
        get => localStorageStatus;
        private set => SetProperty(ref localStorageStatus, value);
    }

    public string PendingStatus { get => pendingStatus; private set => SetProperty(ref pendingStatus, value); }
    public string LastResult { get => lastResult; private set => SetProperty(ref lastResult, value); }
    public string CorrectionSummary
    {
        get => correctionSummary;
        private set => SetProperty(ref correctionSummary, value);
    }

    public bool IsBusy
    {
        get => isBusy;
        private set
        {
            if (SetProperty(ref isBusy, value))
            {
                NotifyCommandStates();
            }
        }
    }

    public bool IsCorrectionPending
    {
        get => isCorrectionPending;
        private set
        {
            if (SetProperty(ref isCorrectionPending, value))
            {
                NotifyCommandStates();
            }
        }
    }

    public IAsyncRelayCommand RegisterCajuelaCommand { get; }
    public IAsyncRelayCommand PrepareCorrectionCommand { get; }
    public IAsyncRelayCommand ConfirmCorrectionCommand { get; }
    public IRelayCommand CancelCorrectionCommand { get; }
    public IAsyncRelayCommand RefreshCommand { get; }

    public Task InitializeAsync() => RefreshAsync();

    public async Task RefreshAsync()
    {
        await RunAsync(async () =>
        {
            LocalOperationDashboardSnapshot snapshot = await dashboard.GetAsync(stationId)
                .ConfigureAwait(true);
            Apply(snapshot);
            IsLocalStorageAvailable = true;
            LocalStorageStatus = "Guardado local disponible";
            PendingStatus = snapshot.PendingOutboxCount == 1
                ? "1 pendiente por enviar"
                : $"{snapshot.PendingOutboxCount} pendientes por enviar";
        }, "No se pudo leer el estado local. Avise al jefe de planta.").ConfigureAwait(true);
    }

    private async Task RegisterCajuelaAsync()
    {
        await RunAsync(async () =>
        {
            RegisterCajuelaCommand command = registerHandler.CreateCommand(stationId);
            RegisterCajuelaResult result = await registerHandler.ExecuteAsync(command).ConfigureAwait(true);
            Line.Total = result.Total;
            LastResult = result.WasDuplicate
                ? $"Cajuela ya registrada. Total: {result.Total}."
                : $"Cajuela guardada localmente. Total: {result.Total}.";
            await RefreshSnapshotAsync().ConfigureAwait(true);
        }, "No se guardó la cajuela. Revise el contexto local.").ConfigureAwait(true);
    }

    private async Task PrepareCorrectionAsync()
    {
        await RunAsync(async () =>
        {
            preparedReversal = await reversalHandler.PrepareAsync(stationId).ConfigureAwait(true);
            CorrectionSummary =
                $"Se corregirá la última cajuela. El total cambiará de " +
                $"{preparedReversal.TotalBeforeCorrection} a {preparedReversal.TotalBeforeCorrection - 1}.";
            IsCorrectionPending = true;
            LastResult = "Confirme la corrección o cancele para conservar el conteo.";
        }, "No hay una última cajuela disponible para corregir.").ConfigureAwait(true);
    }

    private async Task ConfirmCorrectionAsync()
    {
        PreparedCajuelaReversal? prepared = preparedReversal;
        if (prepared is null)
        {
            return;
        }

        bool confirmed = await RunAsync(async () =>
        {
            RevertLastCajuelaResult result = await reversalHandler.ConfirmAsync(prepared)
                .ConfigureAwait(true);
            preparedReversal = null;
            IsCorrectionPending = false;
            CorrectionSummary = string.Empty;
            Line.Total = result.Total;
            LastResult = result.WasDuplicate
                ? $"Corrección ya aplicada. Total: {result.Total}."
                : $"Última cajuela corregida con trazabilidad. Total: {result.Total}.";
            await RefreshSnapshotAsync().ConfigureAwait(true);
        }, "La corrección no se aplicó porque cambió el contexto. Prepárela nuevamente.")
            .ConfigureAwait(true);
        if (!confirmed)
        {
            preparedReversal = null;
            IsCorrectionPending = false;
            CorrectionSummary = string.Empty;
        }
    }

    private void CancelCorrection()
    {
        preparedReversal = null;
        IsCorrectionPending = false;
        CorrectionSummary = string.Empty;
        LastResult = "Corrección cancelada. El conteo no cambió.";
    }

    private async Task RefreshSnapshotAsync()
    {
        LocalOperationDashboardSnapshot snapshot = await dashboard.GetAsync(stationId)
            .ConfigureAwait(true);
        Apply(snapshot);
        PendingStatus = snapshot.PendingOutboxCount == 1
            ? "1 pendiente por enviar"
            : $"{snapshot.PendingOutboxCount} pendientes por enviar";
    }

    private void Apply(LocalOperationDashboardSnapshot snapshot)
    {
        Line.LineName = snapshot.LineName;
        Line.IsReady = snapshot.IsReady;
        Line.StateLabel = snapshot.IsReady ? "LÍNEA LISTA" : "LÍNEA SIN PREPARAR";
        Line.Total = snapshot.Total;
        WorkPeriod workPeriod = WorkPeriodSchedule.At(timeProvider.GetUtcNow());
        Line.WorkPeriodDescription = workPeriod == WorkPeriod.Day
            ? "Jornada: Diurna · automática desde las 06:00"
            : "Jornada: Nocturna · automática desde las 18:00";

        if (!snapshot.IsReady)
        {
            Line.FeedDescription = "El jefe de planta debe preparar un cargamento.";
            Line.ResponsibleDescription = "Sin responsable asignado";
            Line.PreviousResponsibleDescription = string.Empty;
            Line.HasPreviousResponsible = false;
            NotifyCommandStates();
            return;
        }

        Line.FeedDescription =
            $"Alimentación actual: {snapshot.SupplierName} · inicio " +
            FormatTime(snapshot.ShipmentStartedAt!.Value);
        Line.ResponsibleDescription =
            $"Responsable actual: {snapshot.ResponsibleName} · desde " +
            FormatTime(snapshot.ResponsibleSince!.Value);
        Line.HasPreviousResponsible = snapshot.PreviousResponsibleName is not null;
        Line.PreviousResponsibleDescription = Line.HasPreviousResponsible
            ? $"Responsable anterior: {snapshot.PreviousResponsibleName} · hasta " +
              FormatTime(snapshot.PreviousResponsibleUntil!.Value)
            : string.Empty;
        NotifyCommandStates();
    }

    private async Task<bool> RunAsync(Func<Task> action, string failureMessage)
    {
        IsBusy = true;
        try
        {
            await action().ConfigureAwait(true);
            return true;
        }
        catch (InvalidOperationException)
        {
            LastResult = failureMessage;
            return false;
        }
        catch (Exception exception) when (exception is IOException or SqliteException)
        {
            IsLocalStorageAvailable = false;
            LocalStorageStatus = "Guardado local no disponible";
            LastResult = failureMessage;
            return false;
        }
        finally
        {
            IsBusy = false;
        }
    }

    private bool CanRegisterCajuela() =>
        Line.IsReady && IsLocalStorageAvailable && !IsBusy && !IsCorrectionPending;

    private bool CanPrepareCorrection() =>
        Line.IsReady && IsLocalStorageAvailable && Line.Total > 0 && !IsBusy && !IsCorrectionPending;
    private bool CanConfirmCorrection() => IsCorrectionPending && !IsBusy;

    private void NotifyCommandStates()
    {
        RegisterCajuelaCommand.NotifyCanExecuteChanged();
        PrepareCorrectionCommand.NotifyCanExecuteChanged();
        ConfirmCorrectionCommand.NotifyCanExecuteChanged();
        CancelCorrectionCommand.NotifyCanExecuteChanged();
        RefreshCommand.NotifyCanExecuteChanged();
    }

    private static string FormatTime(DateTimeOffset instant) =>
        instant.ToOffset(CostaRicaOffset).ToString("HH:mm", CultureInfo.InvariantCulture);

    private bool IsLocalStorageAvailable
    {
        get => isLocalStorageAvailable;
        set
        {
            if (SetProperty(ref isLocalStorageAvailable, value))
            {
                NotifyCommandStates();
            }
        }
    }
}
