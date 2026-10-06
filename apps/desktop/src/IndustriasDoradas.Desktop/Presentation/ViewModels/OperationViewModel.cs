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

public sealed record OperationMilestoneAlertViewModel(
    Guid Id,
    Guid LineId,
    string AccentColor,
    string Icon,
    string Title,
    string Message,
    string AlertKey = "",
    bool IsPersistent = false);

public sealed class OperationViewModel : ObservableObject
{
    private static readonly TimeSpan CostaRicaOffset = TimeSpan.FromHours(-6);
    private readonly ILocalOperationDashboardRepository dashboard;
    private readonly RegisterCajuelaHandler registerHandler;
    private readonly RevertLastCajuelaHandler reversalHandler;
    private readonly RecordProductionSweepHandler sweepHandler;
    private readonly TimeProvider timeProvider;
    private readonly IInputCommandSource inputSource;
    private readonly OperationInputGuard inputGuard;
    private readonly IOperationInputMetrics inputMetrics;
    private readonly IOperationFeedbackPlayer feedbackPlayer;
    private readonly ProductionMilestoneService milestones;
    private readonly OperationSafetyOptions safetyOptions;
    private readonly Guid stationId;
    private OperationLinePanelViewModel line = new();
    private PreparedCajuelaReversal? preparedReversal;
    private PreparedProductionSweep? preparedSweep;
    private string localStorageStatus = "Preparando almacenamiento local…";
    private string pendingStatus = "Pendientes por enviar: —";
    private string lastResult = "Esperando una operación.";
    private string correctionSummary = string.Empty;
    private string correctionReason = string.Empty;
    private bool correctionRequiresPlantManager;
    private bool isBusy;
    private bool isCorrectionPending;
    private bool isSweepConfirmationPending;
    private string sweepConfirmationSummary = string.Empty;
    private bool isLocalStorageAvailable;
    private OperationFocusTarget focusedTarget = OperationFocusTarget.RegisterCajuela;
    private OperationFeedbackKind feedbackKind;

    public OperationViewModel(
        ILocalOperationDashboardRepository dashboard,
        RegisterCajuelaHandler registerHandler,
        RevertLastCajuelaHandler reversalHandler,
        RecordProductionSweepHandler sweepHandler,
        IInputCommandSource inputSource,
        OperationInputGuard inputGuard,
        IOperationInputMetrics inputMetrics,
        IOperationFeedbackPlayer feedbackPlayer,
        ProductionMilestoneService milestones,
        IOptions<OperationSafetyOptions> safetyOptions,
        IOptions<StationOptions> stationOptions,
        TimeProvider timeProvider)
    {
        this.dashboard = dashboard;
        this.registerHandler = registerHandler;
        this.reversalHandler = reversalHandler;
        this.sweepHandler = sweepHandler;
        this.inputSource = inputSource;
        this.inputGuard = inputGuard;
        this.inputMetrics = inputMetrics;
        this.feedbackPlayer = feedbackPlayer;
        this.milestones = milestones;
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
        RegisterFiveLineCajuelasCommand = new AsyncRelayCommand<Guid>(
            RegisterFiveLineCajuelasAsync,
            CanRegisterLineCajuela);
        PrepareLineCorrectionCommand = new AsyncRelayCommand<Guid>(
            PrepareLineCorrectionAsync,
            CanPrepareLineCorrection);
        PrepareLineSweepCommand = new AsyncRelayCommand<Guid>(
            PrepareLineSweepAsync,
            CanPrepareLineSweep);
        ConfirmSweepCommand = new AsyncRelayCommand(ConfirmSweepAsync, CanConfirmSweep);
        CancelSweepCommand = new RelayCommand(CancelSweep, CanCancelSweep);
        ShowComingSoonCommand = new RelayCommand(ShowComingSoon);
        DismissMilestoneAlertCommand = new RelayCommand<Guid>(DismissMilestoneAlert);
        MilestoneAlerts.CollectionChanged += (_, _) =>
        {
            OnPropertyChanged(nameof(IsMilestoneAlertVisible));
            OnPropertyChanged(nameof(MilestoneAlertTitle));
            OnPropertyChanged(nameof(MilestoneAlertMessage));
            OnPropertyChanged(nameof(MilestoneAlertIcon));
        };
    }

    public OperationLinePanelViewModel Line
    {
        get => line;
        private set => SetProperty(ref line, value);
    }

    public ObservableCollection<OperationLinePanelViewModel> Lines { get; } = [];
    public ObservableCollection<OperationMilestoneAlertViewModel> MilestoneAlerts { get; } = [];
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

    public string CorrectionReason
    {
        get => correctionReason;
        set => SetProperty(ref correctionReason, value);
    }

    public bool CorrectionRequiresPlantManager
    {
        get => correctionRequiresPlantManager;
        private set => SetProperty(ref correctionRequiresPlantManager, value);
    }

    public bool IsSweepConfirmationPending
    {
        get => isSweepConfirmationPending;
        private set
        {
            if (SetProperty(ref isSweepConfirmationPending, value))
            {
                NotifyCommandStates();
            }
        }
    }

    public string SweepConfirmationSummary
    {
        get => sweepConfirmationSummary;
        private set => SetProperty(ref sweepConfirmationSummary, value);
    }

    public bool IsMilestoneAlertVisible => MilestoneAlerts.Count > 0;
    public string MilestoneAlertTitle => MilestoneAlerts.LastOrDefault()?.Title ?? string.Empty;
    public string MilestoneAlertMessage => MilestoneAlerts.LastOrDefault()?.Message ?? string.Empty;
    public string MilestoneAlertIcon => MilestoneAlerts.LastOrDefault()?.Icon ?? "🔎";

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
    public IAsyncRelayCommand<Guid> RegisterFiveLineCajuelasCommand { get; }
    public IAsyncRelayCommand<Guid> PrepareLineCorrectionCommand { get; }
    public IAsyncRelayCommand<Guid> PrepareLineSweepCommand { get; }
    public IAsyncRelayCommand ConfirmSweepCommand { get; }
    public IRelayCommand CancelSweepCommand { get; }
    public IRelayCommand ShowComingSoonCommand { get; }
    public IRelayCommand<Guid> DismissMilestoneAlertCommand { get; }

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

    private async Task RegisterFiveLineCajuelasAsync(Guid lineId)
    {
        if (!TrySelectLine(lineId)) return;
        if (!CanRegisterLineCajuela(lineId))
        {
            ShowFeedback(OperationFeedbackKind.Warning,
                "Agregar cinco cajuelas no está disponible en el estado actual.");
            return;
        }

        OperationLinePanelViewModel selectedLine = Line;
        int previousTotal = selectedLine.Total;
        int savedCount = 0;
        bool succeeded = await RunAsync(async () =>
        {
            int currentTotal = previousTotal;
            for (int index = 0; index < 5; index++)
            {
                var inputCommand = new OperationInputCommand(
                    Guid.NewGuid(),
                    OperationInputAction.RegisterCajuela,
                    new OperationInputOrigin(
                        "CLICK",
                        "shared-pointer",
                        "RegisterFiveCajuelas",
                        selectedLine.LineSlot,
                        false),
                    timeProvider.GetUtcNow());
                long started = timeProvider.GetTimestamp();
                try
                {
                    RegisterCajuelaCommand command = RegisterCajuelaHandler.CreateCommand(
                        stationId,
                        selectedLine.LineId,
                        inputCommand);
                    RegisterCajuelaResult result = await registerHandler.ExecuteAsync(command)
                        .ConfigureAwait(true);
                    currentTotal = result.Total;
                    if (!result.WasDuplicate) savedCount++;
                    RecordMetric(
                        inputCommand,
                        OperationInputMetricOutcome.Accepted,
                        started,
                        null,
                        null);
                }
                catch
                {
                    RecordMetric(
                        inputCommand,
                        OperationInputMetricOutcome.Failed,
                        started,
                        null,
                        "LOCAL_WRITE_FAILED");
                    throw;
                }
            }

            selectedLine.Total = currentTotal;
            ProductionReviewAlertState review = ApplyMilestones(
                selectedLine, currentTotal, selectedLine.LastSweepCumulativeTotal);
            ProductionReviewAlertState previousReview = milestones.CalculateReviewAlert(previousTotal);
            if (review.IsActive &&
                (!previousReview.IsActive || previousReview.ActiveReference != review.ActiveReference))
            {
                ShowReviewAlert(selectedLine, review.ActiveReference!.Value);
            }

            ShowFeedback(
                OperationFeedbackKind.Success,
                $"{savedCount} cajuelas guardadas en {selectedLine.LineName}. Total: {currentTotal}.");
            await RefreshSnapshotAsync().ConfigureAwait(true);
        }, "No se completó el registro de cinco cajuelas. Revise el contexto local.").ConfigureAwait(true);

        if (!succeeded)
        {
            ShowFeedback(OperationFeedbackKind.Error, LastResult);
        }
    }

    private async Task PrepareLineCorrectionAsync(Guid lineId)
    {
        if (!TrySelectLine(lineId)) return;
        await PrepareCorrectionAsync().ConfigureAwait(true);
    }

    private async Task PrepareLineSweepAsync(Guid lineId)
    {
        if (!TrySelectLine(lineId)) return;
        bool prepared = await RunAsync(async () =>
        {
            preparedSweep = await sweepHandler.PrepareAsync(stationId, lineId).ConfigureAwait(true);
            SweepConfirmationSummary =
                $"{Line.LineName}: se incluirán {preparedSweep.CajuelaQuantity} cajuelas " +
                $"hasta el total acumulado {preparedSweep.TotalCajuelas}. " +
                "La recuperación de mercurio quedará pendiente.";
            IsSweepConfirmationPending = true;
            ShowFeedback(
                OperationFeedbackKind.Warning,
                "Barrida preparada. Active Modo Jefe de Planta para confirmarla.");
        }, "No hay cajuelas nuevas disponibles para registrar en una barrida.").ConfigureAwait(true);
        if (!prepared)
        {
            ShowFeedback(OperationFeedbackKind.Warning, LastResult);
        }
    }

    private async Task ConfirmSweepAsync()
    {
        PreparedProductionSweep? prepared = preparedSweep;
        if (prepared is null) return;
        bool confirmed = await RunAsync(async () =>
        {
            LocalSweepRegistration result = await sweepHandler
                .ConfirmAsync(prepared, isFinal: false)
                .ConfigureAwait(true);
            preparedSweep = null;
            IsSweepConfirmationPending = false;
            SweepConfirmationSummary = string.Empty;
            ShowFeedback(
                OperationFeedbackKind.Success,
                result.WasDuplicate
                    ? $"La barrida ya estaba registrada. Acumulado barrido: {result.CumulativeSweptTotal}."
                    : $"Barrida registrada: {result.Sweep.CajuelaQuantity} cajuelas. " +
                      $"Próxima referencia: {result.CumulativeSweptTotal + 250}.");
            await RefreshSnapshotAsync().ConfigureAwait(true);
        }, "No se pudo confirmar la barrida; prepárela nuevamente.").ConfigureAwait(true);
        if (!confirmed)
        {
            preparedSweep = null;
            IsSweepConfirmationPending = false;
            SweepConfirmationSummary = string.Empty;
            ShowFeedback(OperationFeedbackKind.Error, LastResult);
        }
    }

    private void CancelSweep()
    {
        preparedSweep = null;
        IsSweepConfirmationPending = false;
        SweepConfirmationSummary = string.Empty;
        ShowFeedback(OperationFeedbackKind.Neutral, "Barrida cancelada; no se modificó el registro.");
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
            int previousTotal = Line.Total;
            RegisterCajuelaCommand command = RegisterCajuelaHandler.CreateCommand(
                stationId,
                Line.LineId,
                inputCommand);
            RegisterCajuelaResult result = await registerHandler.ExecuteAsync(command).ConfigureAwait(true);
            Line.Total = result.Total;
            ProductionReviewAlertState review = ApplyMilestones(
                Line, result.Total, Line.LastSweepCumulativeTotal);
            ProductionReviewAlertState previousReview = milestones.CalculateReviewAlert(previousTotal);
            if (!result.WasDuplicate && review.IsActive &&
                (!previousReview.IsActive || previousReview.ActiveReference != review.ActiveReference))
            {
                ShowReviewAlert(Line, review.ActiveReference!.Value);
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
            CorrectionRequiresPlantManager = preparedReversal.RequiresPlantManager;
            CorrectionReason = string.Empty;
            CorrectionSummary = preparedReversal.RequiresPlantManager
                ? $"La última cajuela tiene más de cinco minutos. El total cambiará de " +
                  $"{preparedReversal.TotalBeforeCorrection} a {preparedReversal.TotalBeforeCorrection - 1}; " +
                  "active Modo Jefe de Planta e indique el motivo."
                : $"Corrección rápida de la última cajuela. El total cambiará de " +
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
                ? await reversalHandler.ConfirmAsync(
                    prepared,
                    OperationInputOrigin.Application(),
                    CorrectionReason).ConfigureAwait(true)
                : await reversalHandler.ConfirmAsync(
                    prepared,
                    inputCommand.Origin,
                    CorrectionReason).ConfigureAwait(true);
            preparedReversal = null;
            IsCorrectionPending = false;
            CorrectionSummary = string.Empty;
            CorrectionReason = string.Empty;
            CorrectionRequiresPlantManager = false;
            Line.Total = result.Total;
            ApplyMilestones(Line, result.Total, Line.LastSweepCumulativeTotal);
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
            CorrectionReason = string.Empty;
            CorrectionRequiresPlantManager = false;
        }
    }

    private void CancelCorrection()
    {
        preparedReversal = null;
        IsCorrectionPending = false;
        CorrectionSummary = string.Empty;
        CorrectionReason = string.Empty;
        CorrectionRequiresPlantManager = false;
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
        SynchronizeSweepAlerts();
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
        ApplyMilestones(panel, snapshot.Total, snapshot.LastSweepCumulativeTotal);
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
        catch (UnauthorizedAccessException exception)
        {
            LastResult = exception.Message;
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
        Line.Total > Line.LastSweepCumulativeTotal && !IsBusy && !IsCorrectionPending &&
        !IsSweepConfirmationPending;
    private bool CanPrepareLineCorrection(Guid lineId) =>
        Lines.Any(item => item.LineId == lineId && item.IsReady &&
            item.Total > item.LastSweepCumulativeTotal) &&
        IsLocalStorageAvailable && !IsBusy && !IsCorrectionPending && !IsSweepConfirmationPending;
    private bool CanConfirmCorrection() => IsCorrectionPending && !IsBusy;
    private bool CanPrepareLineSweep(Guid lineId) =>
        Lines.Any(item => item.LineId == lineId && item.IsReady &&
            item.Total > item.LastSweepCumulativeTotal) &&
        IsLocalStorageAvailable && !IsBusy && !IsSweepConfirmationPending;
    private bool CanConfirmSweep() => IsSweepConfirmationPending && !IsBusy;
    private bool CanCancelSweep() => IsSweepConfirmationPending && !IsBusy;

    private void ShowComingSoon() =>
        ShowFeedback(OperationFeedbackKind.Neutral,
            "Próximamente: confirmación persistente de revisiones y barridas.");

    private ProductionReviewAlertState ApplyMilestones(
        OperationLinePanelViewModel panel,
        int total,
        int lastSweepCumulativeTotal)
    {
        ProductionReviewAlertState review = milestones.CalculateReviewAlert(total);
        panel.ApplyMilestones(
            review,
            milestones.CalculateSweepProgress(
                total,
                lastSweepCumulativeTotal == 0 ? null : lastSweepCumulativeTotal));
        return review;
    }

    private void ShowReviewAlert(OperationLinePanelViewModel linePanel, long reference)
    {
        ShowTransientAlert(new OperationMilestoneAlertViewModel(
            Guid.NewGuid(),
            linePanel.LineId,
            linePanel.AccentColor,
            "🔎",
            "Revisar mercurio",
            $"{linePanel.LineName} alcanzó {reference} cajuelas. Revise el mercurio.",
            $"REVIEW:{linePanel.LineId:D}"));
        feedbackPlayer.PlayReviewAlert();
    }

    private void ShowTransientAlert(OperationMilestoneAlertViewModel alert)
    {
        OperationMilestoneAlertViewModel? previous = MilestoneAlerts.FirstOrDefault(
            item => item.AlertKey == alert.AlertKey);
        if (previous is not null)
        {
            MilestoneAlerts.Remove(previous);
        }

        MilestoneAlerts.Add(alert);
        if (!alert.IsPersistent)
        {
            _ = HideMilestoneAlertAsync(alert.Id);
        }
    }

    private void SynchronizeSweepAlerts()
    {
        HashSet<string> activeKeys = Lines
            .Where(item => item.IsSweepPending)
            .Select(item => $"SWEEP:{item.LineId:D}")
            .ToHashSet(StringComparer.Ordinal);
        OperationMilestoneAlertViewModel[] obsolete = MilestoneAlerts
            .Where(item => item.IsPersistent && !activeKeys.Contains(item.AlertKey))
            .ToArray();
        foreach (OperationMilestoneAlertViewModel alert in obsolete)
        {
            MilestoneAlerts.Remove(alert);
        }

        foreach (OperationLinePanelViewModel item in Lines.Where(item => item.IsSweepPending))
        {
            string key = $"SWEEP:{item.LineId:D}";
            if (MilestoneAlerts.Any(alert => alert.AlertKey == key)) continue;
            MilestoneAlerts.Add(new OperationMilestoneAlertViewModel(
                Guid.NewGuid(),
                item.LineId,
                item.AccentColor,
                "🧹",
                "Barrida pendiente",
                $"{item.LineName} superó la referencia de barrida. Puede seguir contando y registrar la barrida cuando corresponda.",
                key,
                true));
        }
    }

    private async Task HideMilestoneAlertAsync(Guid alertId)
    {
        await Task.Delay(TimeSpan.FromSeconds(8)).ConfigureAwait(false);

        System.Windows.Threading.Dispatcher? dispatcher = System.Windows.Application.Current?.Dispatcher;
        if (dispatcher is null)
        {
            return;
        }

        if (dispatcher.CheckAccess())
        {
            DismissMilestoneAlert(alertId);
            return;
        }

        await dispatcher.InvokeAsync(() => DismissMilestoneAlert(alertId));
    }

    private void DismissMilestoneAlert(Guid alertId)
    {
        OperationMilestoneAlertViewModel? alert = MilestoneAlerts.FirstOrDefault(item => item.Id == alertId);
        if (alert is not null && !alert.IsPersistent)
        {
            MilestoneAlerts.Remove(alert);
        }
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
        RegisterFiveLineCajuelasCommand.NotifyCanExecuteChanged();
        PrepareLineCorrectionCommand.NotifyCanExecuteChanged();
        PrepareLineSweepCommand.NotifyCanExecuteChanged();
        ConfirmSweepCommand.NotifyCanExecuteChanged();
        CancelSweepCommand.NotifyCanExecuteChanged();
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
