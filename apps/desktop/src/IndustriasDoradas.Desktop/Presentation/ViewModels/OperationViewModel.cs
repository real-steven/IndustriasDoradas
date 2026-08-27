using System.Globalization;
using System.IO;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain.Production;
using IndustriasDoradas.Desktop.Infrastructure.LocalStorage;
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
    private readonly OperationInputGuard inputGuard;
    private readonly IOperationInputMetrics inputMetrics;
    private readonly IOperationFeedbackPlayer feedbackPlayer;
    private readonly OperationSafetyOptions safetyOptions;
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
    private OperationFeedbackKind feedbackKind;

    public OperationViewModel(
        ILocalOperationDashboardRepository dashboard,
        RegisterCajuelaHandler registerHandler,
        RevertLastCajuelaHandler reversalHandler,
        IInputCommandSource inputSource,
        OperationInputGuard inputGuard,
        IOperationInputMetrics inputMetrics,
        IOperationFeedbackPlayer feedbackPlayer,
        IOptions<OperationSafetyOptions> safetyOptions,
        IOptions<StationOptions> stationOptions,
        TimeProvider timeProvider)
    {
        this.dashboard = dashboard;
        this.registerHandler = registerHandler;
        this.reversalHandler = reversalHandler;
        this.inputSource = inputSource;
        this.inputGuard = inputGuard;
        this.inputMetrics = inputMetrics;
        this.feedbackPlayer = feedbackPlayer;
        this.safetyOptions = safetyOptions.Value;
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
    public OperationFeedbackKind FeedbackKind
    {
        get => feedbackKind;
        private set => SetProperty(ref feedbackKind, value);
    }
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
                await TryRegisterCajuelaAsync(command).ConfigureAwait(true);
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

    private Task RegisterCajuelaAsync() => TryRegisterCajuelaAsync(new OperationInputCommand(
        Guid.NewGuid(),
        OperationInputAction.RegisterCajuela,
        OperationInputOrigin.Click(OperationInputAction.RegisterCajuela),
        timeProvider.GetUtcNow()));

    private async Task TryRegisterCajuelaAsync(OperationInputCommand inputCommand)
    {
        long started = timeProvider.GetTimestamp();
        if (inputCommand.Origin.IsRepeat)
        {
            OperationInputGuardDecision repeat = inputGuard.TryAcceptRegistration(inputCommand);
            SuppressRegistration(inputCommand, repeat, started);
            return;
        }

        if (!Line.IsReady || !IsLocalStorageAvailable || IsCorrectionPending)
        {
            ShowFeedback(OperationFeedbackKind.Warning, "Registrar cajuela no está disponible en el estado actual.");
            RecordMetric(inputCommand, OperationInputMetricOutcome.Unavailable, started, null, "CONTEXT_UNAVAILABLE");
            return;
        }

        OperationInputGuardDecision decision = inputGuard.TryAcceptRegistration(inputCommand);
        if (!decision.IsAccepted)
        {
            SuppressRegistration(inputCommand, decision, started);
            return;
        }

        if (IsBusy)
        {
            ShowFeedback(OperationFeedbackKind.Warning, "La operación anterior todavía está terminando.");
            RecordMetric(inputCommand, OperationInputMetricOutcome.Unavailable, started, decision.IntervalMilliseconds, "BUSY");
            return;
        }

        bool succeeded = await RunAsync(async () =>
        {
            RegisterCajuelaCommand command = RegisterCajuelaHandler.CreateCommand(stationId, inputCommand);
            RegisterCajuelaResult result = await registerHandler.ExecuteAsync(command).ConfigureAwait(true);
            Line.Total = result.Total;
            ShowFeedback(OperationFeedbackKind.Success, result.WasDuplicate
                ? $"Cajuela ya registrada. Total: {result.Total}."
                : $"Cajuela guardada localmente. Total: {result.Total}.");
            await RefreshSnapshotAsync().ConfigureAwait(true);
        }, "No se guardó la cajuela. Revise el contexto local.").ConfigureAwait(true);
        if (!succeeded)
        {
            ShowFeedback(OperationFeedbackKind.Error, LastResult);
        }

        RecordMetric(
            inputCommand,
            succeeded ? OperationInputMetricOutcome.Accepted : OperationInputMetricOutcome.Failed,
            started,
            decision.IntervalMilliseconds,
            succeeded ? null : "LOCAL_WRITE_FAILED");
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
            ShowFeedback(OperationFeedbackKind.Warning, "Confirme la corrección o cancele para conservar el conteo.");
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
            ShowFeedback(OperationFeedbackKind.Success, result.WasDuplicate
                ? $"Corrección ya aplicada. Total: {result.Total}."
                : $"Última cajuela corregida con trazabilidad. Total: {result.Total}.");
            await RefreshSnapshotAsync().ConfigureAwait(true);
        }, "La corrección no se aplicó porque cambió el contexto. Prepárela nuevamente.")
            .ConfigureAwait(true);
        if (!confirmed)
        {
            ShowFeedback(OperationFeedbackKind.Error, LastResult);
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
        ShowFeedback(OperationFeedbackKind.Neutral, "Corrección cancelada. El conteo no cambió.");
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
                await TryRegisterCajuelaAsync(command with { Action = OperationInputAction.RegisterCajuela })
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
        catch (LocalClockRollbackException exception)
        {
            IsLocalStorageAvailable = false;
            LocalStorageStatus = "Guardado bloqueado: revise el reloj";
            LastResult = exception.Message;
            return false;
        }
        catch (InvalidOperationException)
        {
            LastResult = failureMessage;
            return false;
        }
        catch (Exception exception) when (exception is IOException or SqliteException)
        {
            LocalStorageFailure failure = LocalStorageFailureClassifier.Classify(exception);
            IsLocalStorageAvailable = false;
            LocalStorageStatus = failure.Kind switch
            {
                LocalStorageFailureKind.Locked => "Guardado local ocupado",
                LocalStorageFailureKind.DiskFull => "Guardado bloqueado: disco lleno",
                LocalStorageFailureKind.Corrupt => "Guardado bloqueado: revise integridad",
                _ => "Guardado local no disponible",
            };
            LastResult = $"{failure.UserMessage} {failure.RecoveryInstruction}";
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

    private void SuppressRegistration(
        OperationInputCommand command,
        OperationInputGuardDecision decision,
        long started)
    {
        string message = decision.Suppression == OperationInputSuppression.AutoRepeat
            ? "Pulsación sostenida ignorada; suelte la tecla para registrar otra cajuela."
            : $"Pulsación demasiado rápida ignorada ({decision.IntervalMilliseconds:0} ms); vuelva a pulsar deliberadamente.";
        string code = decision.Suppression == OperationInputSuppression.AutoRepeat ? "AUTO_REPEAT" : "DEBOUNCE";
        ShowFeedback(OperationFeedbackKind.Warning, message);
        RecordMetric(command, OperationInputMetricOutcome.Suppressed, started, decision.IntervalMilliseconds, code);
    }

    private void RecordMetric(
        OperationInputCommand command,
        OperationInputMetricOutcome outcome,
        long started,
        double? intervalMilliseconds,
        string? errorCode)
    {
        DateTimeOffset recordedAt = timeProvider.GetUtcNow().ToUniversalTime();
        DateTimeOffset occurredAt = command.OccurredAt.ToUniversalTime();
        if (recordedAt < occurredAt) recordedAt = occurredAt;
        inputMetrics.Record(new LocalOperationInputMetric(
            Guid.NewGuid(),
            command.Action,
            command.Origin.SourceKind,
            outcome,
            Math.Max(0, timeProvider.GetElapsedTime(started, timeProvider.GetTimestamp()).TotalMilliseconds),
            intervalMilliseconds,
            command.Origin.IsRepeat,
            errorCode,
            occurredAt,
            recordedAt));
    }

    private void ShowFeedback(OperationFeedbackKind kind, string message)
    {
        LastResult = message;
        FeedbackKind = safetyOptions.VisualFeedbackEnabled ? kind : OperationFeedbackKind.Neutral;
        feedbackPlayer.Play(kind);
    }

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
