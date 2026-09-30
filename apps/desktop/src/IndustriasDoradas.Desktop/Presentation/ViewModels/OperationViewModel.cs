using System.Globalization;
using System.IO;
using System.Collections.ObjectModel;
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
    private OperationLinePanelViewModel line = new();
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
    private bool isMilestoneAlertVisible;
    private string milestoneAlertTitle = string.Empty;
    private string milestoneAlertMessage = string.Empty;
    private string milestoneAlertIcon = "🔎";
    private int milestoneAlertVersion;

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
        RegisterLineCajuelaCommand = new AsyncRelayCommand<Guid>(
            RegisterLineCajuelaAsync,
            CanRegisterLineCajuela);
        PrepareLineCorrectionCommand = new AsyncRelayCommand<Guid>(
            PrepareLineCorrectionAsync,
            CanPrepareLineCorrection);
        ShowSweepReminderCommand = new RelayCommand<Guid>(ShowSweepReminder);
        ShowComingSoonCommand = new RelayCommand(ShowComingSoon);
        DismissMilestoneAlertCommand = new RelayCommand(DismissMilestoneAlert);
    }

    public OperationLinePanelViewModel Line
    {
        get => line;
        private set => SetProperty(ref line, value);
    }

    public ObservableCollection<OperationLinePanelViewModel> Lines { get; } = [];
    public bool HasActiveLines => Lines.Count > 0;
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

    public bool IsMilestoneAlertVisible
    {
        get => isMilestoneAlertVisible;
        private set => SetProperty(ref isMilestoneAlertVisible, value);
    }

    public string MilestoneAlertTitle
    {
        get => milestoneAlertTitle;
        private set => SetProperty(ref milestoneAlertTitle, value);
    }

    public string MilestoneAlertMessage
    {
        get => milestoneAlertMessage;
        private set => SetProperty(ref milestoneAlertMessage, value);
    }

    public string MilestoneAlertIcon
    {
        get => milestoneAlertIcon;
        private set => SetProperty(ref milestoneAlertIcon, value);
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
    public IAsyncRelayCommand<Guid> RegisterLineCajuelaCommand { get; }
    public IAsyncRelayCommand<Guid> PrepareLineCorrectionCommand { get; }
    public IRelayCommand<Guid> ShowSweepReminderCommand { get; }
    public IRelayCommand ShowComingSoonCommand { get; }
    public IRelayCommand DismissMilestoneAlertCommand { get; }

    public Task InitializeAsync() => RefreshAsync();

    public async Task HandleInputCommandAsync(OperationInputCommand command)
    {
        ArgumentNullException.ThrowIfNull(command);
        command.Origin.Validate();
        if (command.CommandId == Guid.Empty)
        {
            throw new ArgumentException("El UUID del comando de entrada es obligatorio.", nameof(command));
        }

        OperationLinePanelViewModel? requestedLine = Lines.FirstOrDefault(
            item => item.LineSlot == command.Origin.LineSlot);
        if (requestedLine is null && command.Origin.LineSlot == 1 && Line.IsReady)
        {
            requestedLine = Line;
        }
        if (requestedLine is null)
        {
            LastResult = $"La Línea {command.Origin.LineSlot} no está preparada para operar.";
            return;
        }
        Line = requestedLine;

        switch (command.Action)
        {
            case OperationInputAction.SelectLine:
                FocusedTarget = OperationFocusTarget.RegisterCajuela;
                LastResult = $"{Line.LineName} seleccionada para operar.";
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
            IReadOnlyList<LocalOperationDashboardSnapshot> snapshots = await dashboard.ListAsync(stationId)
                .ConfigureAwait(true);
            Apply(snapshots);
            IsLocalStorageAvailable = true;
            LocalStorageStatus = "Guardado local disponible";
            PendingStatus = FormatOutboxStatus(snapshots.Count == 0 ? null : snapshots[0]);
        }, "No se pudo leer el estado local. Avise al jefe de planta.").ConfigureAwait(true);
    }

    private Task RegisterCajuelaAsync() => TryRegisterCajuelaAsync(new OperationInputCommand(
        Guid.NewGuid(),
        OperationInputAction.RegisterCajuela,
        OperationInputOrigin.Click(OperationInputAction.RegisterCajuela),
        timeProvider.GetUtcNow()));

    private async Task RegisterLineCajuelaAsync(Guid lineId)
    {
        if (!TrySelectLine(lineId)) return;
        await RegisterCajuelaAsync().ConfigureAwait(true);
    }

    private async Task PrepareLineCorrectionAsync(Guid lineId)
    {
        if (!TrySelectLine(lineId)) return;
        await PrepareCorrectionAsync().ConfigureAwait(true);
    }

    private bool TrySelectLine(Guid lineId)
    {
        OperationLinePanelViewModel? selected = Lines.FirstOrDefault(item => item.LineId == lineId);
        if (selected is null)
        {
            ShowFeedback(OperationFeedbackKind.Warning, "La línea seleccionada ya no está activa.");
            return false;
        }

        Line = selected;
        return true;
    }

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
            RegisterCajuelaCommand command = RegisterCajuelaHandler.CreateCommand(
                stationId,
                Line.LineId,
                inputCommand);
            RegisterCajuelaResult result = await registerHandler.ExecuteAsync(command).ConfigureAwait(true);
            Line.Total = result.Total;
            if (!result.WasDuplicate && result.Total > 0 && result.Total % 50 == 0)
            {
                ShowMilestoneAlert(Line.LineName, result.Total);
            }
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
            preparedReversal = await reversalHandler.PrepareAsync(stationId, Line.LineId)
                .ConfigureAwait(true);
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
        IReadOnlyList<LocalOperationDashboardSnapshot> snapshots = await dashboard.ListAsync(stationId)
            .ConfigureAwait(true);
        Apply(snapshots);
        PendingStatus = FormatOutboxStatus(snapshots.Count == 0 ? null : snapshots[0]);
    }

    private void Apply(IReadOnlyList<LocalOperationDashboardSnapshot> snapshots)
    {
        Guid selectedLineId = Line.LineId;
        Dictionary<Guid, OperationLinePanelViewModel> existing = Lines
            .Where(item => item.LineId != Guid.Empty)
            .GroupBy(item => item.LineId)
            .ToDictionary(group => group.Key, group => group.First());
        var active = snapshots
            .Select((snapshot, index) => new { Snapshot = snapshot, LineSlot = index + 1 })
            .Where(item => item.Snapshot.IsReady)
            .Take(4)
            .ToArray();
        Lines.Clear();
        for (int index = 0; index < active.Length; index++)
        {
            LocalOperationDashboardSnapshot snapshot = active[index].Snapshot;
            if (!existing.TryGetValue(snapshot.LineId, out OperationLinePanelViewModel? panel))
            {
                panel = new OperationLinePanelViewModel();
            }
            ApplyLine(panel, snapshot, active[index].LineSlot);
            Lines.Add(panel);
        }

        OperationLinePanelViewModel? selected = Lines.FirstOrDefault(item => item.LineId == selectedLineId) ??
            Lines.FirstOrDefault();
        if (selected is not null)
        {
            Line = selected;
        }
        else
        {
            LocalOperationDashboardSnapshot? fallback = snapshots.Count == 0 ? null : snapshots[0];
            var fallbackLine = new OperationLinePanelViewModel();
            if (fallback is not null)
            {
                ApplyLine(fallbackLine, fallback, 1);
            }
            Line = fallbackLine;
        }

        OnPropertyChanged(nameof(HasActiveLines));
        NotifyCommandStates();
    }

    private void ApplyLine(
        OperationLinePanelViewModel panel,
        LocalOperationDashboardSnapshot snapshot,
        int lineSlot)
    {
        string[] accents = ["#8959DD", "#35ADDD", "#ED70A9", "#F19B2C"];
        panel.LineId = snapshot.LineId;
        panel.LineSlot = lineSlot;
        panel.LineName = snapshot.LineName;
        panel.AccentColor = accents[(lineSlot - 1) % accents.Length];
        panel.IsReady = snapshot.IsReady;
        panel.StateLabel = snapshot.IsReady ? "LÍNEA LISTA" : "LÍNEA SIN PREPARAR";
        panel.Total = snapshot.Total;
        panel.SupplierName = snapshot.SupplierName ?? "Sin proveedor";
        panel.ResponsibleName = snapshot.ResponsibleName ?? "Sin responsable";
        WorkPeriod workPeriod = WorkPeriodSchedule.At(timeProvider.GetUtcNow());
        panel.WorkPeriodDescription = workPeriod == WorkPeriod.Day
            ? "Jornada: Diurna · automática desde las 06:00"
            : "Jornada: Nocturna · automática desde las 18:00";

        if (!snapshot.IsReady)
        {
            panel.FeedDescription = "El jefe de planta debe preparar un cargamento.";
            panel.ResponsibleDescription = "Sin responsable asignado";
            panel.PreviousResponsibleDescription = string.Empty;
            panel.HasPreviousResponsible = false;
            return;
        }

        panel.FeedDescription =
            $"Alimentación actual: {snapshot.SupplierName} · inicio " +
            FormatTime(snapshot.ShipmentStartedAt!.Value);
        panel.ResponsibleDescription =
            $"Responsable actual: {snapshot.ResponsibleName} · desde " +
            FormatTime(snapshot.ResponsibleSince!.Value);
        panel.HasPreviousResponsible = snapshot.PreviousResponsibleName is not null;
        panel.PreviousResponsibleDescription = panel.HasPreviousResponsible
            ? $"Responsable anterior: {snapshot.PreviousResponsibleName} · hasta " +
              FormatTime(snapshot.PreviousResponsibleUntil!.Value)
            : string.Empty;
    }

    private static string FormatOutboxStatus(LocalOperationDashboardSnapshot? snapshot) => snapshot is null
        ? "Sin líneas disponibles"
        : $"{snapshot.PendingOutboxCount} pendientes · " +
          $"{snapshot.FailedReviewOutboxCount} requieren revisión · " +
          $"{snapshot.SyncedOutboxCount} sincronizados";

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
        Line.LineId != Guid.Empty && Line.IsReady && IsLocalStorageAvailable && !IsBusy && !IsCorrectionPending;

    private bool CanRegisterLineCajuela(Guid lineId) =>
        Lines.Any(item => item.LineId == lineId && item.IsReady) &&
        IsLocalStorageAvailable && !IsBusy && !IsCorrectionPending;

    private bool CanPrepareCorrection() =>
        Line.LineId != Guid.Empty && Line.IsReady && IsLocalStorageAvailable &&
        Line.Total > 0 && !IsBusy && !IsCorrectionPending;
    private bool CanPrepareLineCorrection(Guid lineId) =>
        Lines.Any(item => item.LineId == lineId && item.IsReady && item.Total > 0) &&
        IsLocalStorageAvailable && !IsBusy && !IsCorrectionPending;
    private bool CanConfirmCorrection() => IsCorrectionPending && !IsBusy;

    private void ShowSweepReminder(Guid lineId)
    {
        OperationLinePanelViewModel? selected = Lines.FirstOrDefault(item => item.LineId == lineId);
        if (selected is null) return;
        MilestoneAlertIcon = "🧹";
        MilestoneAlertTitle = "Realizar barrida";
        MilestoneAlertMessage = selected.Total >= 250
            ? $"{selected.LineName} alcanzó 250 cajuelas. Corresponde realizar la barrida."
            : $"{selected.LineName} tiene {selected.Total} cajuelas. Confirme el procedimiento antes de realizar una barrida.";
        LastResult = "Próximamente: el registro persistente de barridas. Por ahora se muestra el recordatorio visual.";
        ShowMilestoneAlertForEightSeconds();
    }

    private void ShowComingSoon() =>
        ShowFeedback(OperationFeedbackKind.Neutral,
            "Próximamente: confirmación persistente de revisiones y barridas.");

    private void ShowMilestoneAlert(string lineName, int total)
    {
        bool sweep = total % 250 == 0;
        MilestoneAlertIcon = sweep ? "🧹" : "🔎";
        MilestoneAlertTitle = sweep ? "Realizar barrida" : "Revisar mercurio";
        MilestoneAlertMessage = sweep
            ? $"{lineName} alcanzó 250 cajuelas."
            : $"{lineName} alcanzó {total} cajuelas.";
        ShowMilestoneAlertForEightSeconds();
    }

    private void ShowMilestoneAlertForEightSeconds()
    {
        int version = ++milestoneAlertVersion;
        IsMilestoneAlertVisible = true;
        _ = HideMilestoneAlertAsync(version);
    }

    private async Task HideMilestoneAlertAsync(int version)
    {
        await Task.Delay(TimeSpan.FromSeconds(8)).ConfigureAwait(false);
        if (version != milestoneAlertVersion) return;

        System.Windows.Threading.Dispatcher? dispatcher = System.Windows.Application.Current?.Dispatcher;
        if (dispatcher is null || dispatcher.CheckAccess())
        {
            IsMilestoneAlertVisible = false;
            return;
        }

        await dispatcher.InvokeAsync(() => IsMilestoneAlertVisible = false);
    }

    private void DismissMilestoneAlert()
    {
        milestoneAlertVersion++;
        IsMilestoneAlertVisible = false;
    }

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
        RegisterLineCajuelaCommand.NotifyCanExecuteChanged();
        PrepareLineCorrectionCommand.NotifyCanExecuteChanged();
    }

    private static string FormatTime(DateTimeOffset instant) =>
        instant.ToOffset(CostaRicaOffset).ToString("HH:mm", CultureInfo.InvariantCulture);

    private void SuppressRegistration(
        OperationInputCommand command,
        OperationInputGuardDecision decision,
        long started)
    {
        string message = decision.Suppression switch
        {
            OperationInputSuppression.AutoRepeat =>
                "Pulsación sostenida ignorada; suelte la tecla para registrar otra cajuela.",
            OperationInputSuppression.Cooldown =>
                "Pulsación ignorada para evitar un registro doble; espere tres segundos desde la última cajuela.",
            _ =>
                $"Rebote ignorado ({decision.IntervalMilliseconds:0} ms); vuelva a pulsar deliberadamente.",
        };
        string code = decision.Suppression switch
        {
            OperationInputSuppression.AutoRepeat => "AUTO_REPEAT",
            OperationInputSuppression.Cooldown => "REGISTRATION_COOLDOWN",
            _ => "DEBOUNCE",
        };
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
