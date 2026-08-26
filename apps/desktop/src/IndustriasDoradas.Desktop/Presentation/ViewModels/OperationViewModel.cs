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
    private readonly IInputCommandSource inputSource;
    private readonly Guid stationId;
    private PreparedCajuelaReversal? preparedReversal;
    private string localStorageStatus = "Preparando almacenamiento local…";
    private string pendingStatus = "Pendientes por enviar: —";
    private string lastResult = "Esperando una operación.";
    private string correctionSummary = string.Empty;
    private bool isBusy;
    private bool isCorrectionPending;
    private bool isLocalStorageAvailable;
    private OperationFocusTarget focusedTarget = OperationFocusTarget.RegisterCajuela;

    public OperationViewModel(
        ILocalOperationDashboardRepository dashboard,
        RegisterCajuelaHandler registerHandler,
        RevertLastCajuelaHandler reversalHandler,
        IInputCommandSource inputSource,
        IOptions<StationOptions> stationOptions,
        TimeProvider timeProvider)
    {
        this.dashboard = dashboard;
        this.registerHandler = registerHandler;
        this.reversalHandler = reversalHandler;
        this.inputSource = inputSource;
        this.timeProvider = timeProvider;
        stationId = stationOptions.Value.Id;
        RegisterCajuelaCommand = new AsyncRelayCommand(RegisterCajuelaAsync, CanRegisterCajuela);
        PrepareCorrectionCommand = new AsyncRelayCommand(PrepareCorrectionAsync, CanPrepareCorrection);
        ConfirmCorrectionCommand = new AsyncRelayCommand(ConfirmCorrectionAsync, CanConfirmCorrection);
        CancelCorrectionCommand = new RelayCommand(CancelCorrection, () => IsCorrectionPending && !IsBusy);
        RefreshCommand = new AsyncRelayCommand(RefreshAsync, () => !IsBusy);
        DispatchInputCommand = new AsyncRelayCommand<OperationInputAction>(
            DispatchClickAsync,
            CanDispatchInput);
    }

    public OperationLinePanelViewModel Line { get; } = new();
    public IInputCommandSource InputSource => inputSource;
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
                FocusedTarget = value
                    ? OperationFocusTarget.Confirm
                    : OperationFocusTarget.RegisterCajuela;
                NotifyCommandStates();
            }
        }
    }

    public OperationFocusTarget FocusedTarget
    {
        get => focusedTarget;
        private set => SetProperty(ref focusedTarget, value);
    }

    public IAsyncRelayCommand RegisterCajuelaCommand { get; }
    public IAsyncRelayCommand PrepareCorrectionCommand { get; }
    public IAsyncRelayCommand ConfirmCorrectionCommand { get; }
    public IRelayCommand CancelCorrectionCommand { get; }
    public IAsyncRelayCommand RefreshCommand { get; }
    public IAsyncRelayCommand<OperationInputAction> DispatchInputCommand { get; }

    public Task InitializeAsync() => RefreshAsync();

    public async Task HandleInputCommandAsync(OperationInputCommand command)
    {
        ArgumentNullException.ThrowIfNull(command);
        command.Origin.Validate();
        if (command.CommandId == Guid.Empty)
        {
            throw new ArgumentException("El UUID del comando de entrada es obligatorio.", nameof(command));
        }

        if (command.Origin.LineSlot != 1)
        {
            LastResult = $"La Línea {command.Origin.LineSlot} aún no está disponible en el piloto.";
            return;
        }

        switch (command.Action)
        {
            case OperationInputAction.SelectLine:
                FocusedTarget = OperationFocusTarget.RegisterCajuela;
                LastResult = "Línea 1 seleccionada para operar.";
                break;
            case OperationInputAction.RegisterCajuela:
                if (CanRegisterCajuela())
                {
                    await RegisterCajuelaAsync(command).ConfigureAwait(true);
                }
                else
                {
                    LastResult = "Registrar cajuela no está disponible en el estado actual.";
                }

                break;
            case OperationInputAction.RevertLastCajuela:
                if (CanPrepareCorrection())
                {
                    await PrepareCorrectionAsync().ConfigureAwait(true);
                }
                else
                {
                    LastResult = "No hay una última cajuela disponible para corregir.";
                }

                break;
            case OperationInputAction.MoveUp:
            case OperationInputAction.MoveLeft:
                MoveFocus(previous: true);
                break;
            case OperationInputAction.MoveDown:
            case OperationInputAction.MoveRight:
                MoveFocus(previous: false);
                break;
            case OperationInputAction.Confirm:
                await ActivateFocusedAsync(command).ConfigureAwait(true);
                break;
            case OperationInputAction.Cancel:
                if (IsCorrectionPending)
                {
                    CancelCorrection();
                }

                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(command), command.Action, "Acción de entrada desconocida.");
        }
    }

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

    private Task RegisterCajuelaAsync() => RegisterCajuelaAsync(null);

    private async Task RegisterCajuelaAsync(OperationInputCommand? inputCommand)
    {
        await RunAsync(async () =>
        {
            RegisterCajuelaCommand command = inputCommand is null
                ? registerHandler.CreateCommand(stationId)
                : RegisterCajuelaHandler.CreateCommand(stationId, inputCommand);
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

    private Task ConfirmCorrectionAsync() => ConfirmCorrectionAsync(null);

    private async Task ConfirmCorrectionAsync(OperationInputCommand? inputCommand)
    {
        PreparedCajuelaReversal? prepared = preparedReversal;
        if (prepared is null)
        {
            return;
        }

        bool confirmed = await RunAsync(async () =>
        {
            RevertLastCajuelaResult result = inputCommand is null
                ? await reversalHandler.ConfirmAsync(prepared).ConfigureAwait(true)
                : await reversalHandler.ConfirmAsync(prepared, inputCommand.Origin).ConfigureAwait(true);
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

    private Task DispatchClickAsync(OperationInputAction action) =>
        HandleInputCommandAsync(new OperationInputCommand(
            Guid.NewGuid(),
            action,
            OperationInputOrigin.Click(action),
            timeProvider.GetUtcNow()));

    private async Task ActivateFocusedAsync(OperationInputCommand command)
    {
        switch (FocusedTarget)
        {
            case OperationFocusTarget.RegisterCajuela when CanRegisterCajuela():
                await RegisterCajuelaAsync(command with { Action = OperationInputAction.RegisterCajuela })
                    .ConfigureAwait(true);
                break;
            case OperationFocusTarget.RevertLastCajuela when CanPrepareCorrection():
                await PrepareCorrectionAsync().ConfigureAwait(true);
                break;
            case OperationFocusTarget.Confirm when CanConfirmCorrection():
                await ConfirmCorrectionAsync(command).ConfigureAwait(true);
                break;
            case OperationFocusTarget.Cancel when IsCorrectionPending:
                CancelCorrection();
                break;
            default:
                LastResult = "La acción seleccionada no está disponible en el estado actual.";
                break;
        }
    }

    private void MoveFocus(bool previous)
    {
        OperationFocusTarget[] targets = IsCorrectionPending
            ? [OperationFocusTarget.Confirm, OperationFocusTarget.Cancel]
            : [OperationFocusTarget.RegisterCajuela, OperationFocusTarget.RevertLastCajuela];
        int current = Array.IndexOf(targets, FocusedTarget);
        if (current < 0)
        {
            current = 0;
        }

        int offset = previous ? -1 : 1;
        FocusedTarget = targets[(current + offset + targets.Length) % targets.Length];
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

    private bool CanDispatchInput(OperationInputAction action) => action switch
    {
        OperationInputAction.RegisterCajuela => CanRegisterCajuela(),
        OperationInputAction.RevertLastCajuela => CanPrepareCorrection(),
        OperationInputAction.Confirm => CanConfirmCorrection(),
        OperationInputAction.Cancel => IsCorrectionPending && !IsBusy,
        _ => !IsBusy,
    };

    private void NotifyCommandStates()
    {
        RegisterCajuelaCommand.NotifyCanExecuteChanged();
        PrepareCorrectionCommand.NotifyCanExecuteChanged();
        ConfirmCorrectionCommand.NotifyCanExecuteChanged();
        CancelCorrectionCommand.NotifyCanExecuteChanged();
        RefreshCommand.NotifyCanExecuteChanged();
        DispatchInputCommand.NotifyCanExecuteChanged();
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

public enum OperationFocusTarget
{
    RegisterCajuela,
    RevertLastCajuela,
    Confirm,
    Cancel,
}
