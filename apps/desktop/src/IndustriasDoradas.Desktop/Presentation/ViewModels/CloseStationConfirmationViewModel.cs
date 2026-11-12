using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

/// <summary>
/// Confirmación de «Cerrar estación». La estación solo se cierra al confirmar, una única vez,
/// y mientras el cierre está en curso no se puede cancelar ni cerrar el diálogo.
/// </summary>
public sealed class CloseStationConfirmationViewModel : ObservableObject
{
    private readonly Func<Task> closeStation;
    private bool isClosing;
    private bool hasConfirmed;

    public CloseStationConfirmationViewModel(Func<Task> closeStation)
    {
        ArgumentNullException.ThrowIfNull(closeStation);
        this.closeStation = closeStation;
        ConfirmCommand = new AsyncRelayCommand(ConfirmAsync, () => !hasConfirmed);
        CancelCommand = new RelayCommand(Cancel, () => !hasConfirmed);
    }

    /// <summary>El cierre terminó (correcto o con error ya informado por la estación).</summary>
    public event EventHandler? Completed;

    /// <summary>El usuario canceló sin cerrar la estación.</summary>
    public event EventHandler? Cancelled;

    public IAsyncRelayCommand ConfirmCommand { get; }
    public IRelayCommand CancelCommand { get; }

    public bool IsClosing
    {
        get => isClosing;
        private set => SetProperty(ref isClosing, value);
    }

    /// <summary>false mientras se cierra: Esc, Cancelar y la X del diálogo no hacen nada.</summary>
    public bool CanDismiss => !hasConfirmed;

    public bool WasCancelled { get; private set; }

    /// <summary>Intenta cancelar. Devuelve false si el cierre ya empezó.</summary>
    public bool TryCancel()
    {
        if (!CanDismiss) return false;
        if (!WasCancelled)
        {
            WasCancelled = true;
            Cancelled?.Invoke(this, EventArgs.Empty);
        }
        return true;
    }

    private void Cancel() => TryCancel();

    private async Task ConfirmAsync()
    {
        if (hasConfirmed || WasCancelled) return;
        hasConfirmed = true;
        OnPropertyChanged(nameof(CanDismiss));
        ConfirmCommand.NotifyCanExecuteChanged();
        CancelCommand.NotifyCanExecuteChanged();
        IsClosing = true;
        try
        {
            await closeStation().ConfigureAwait(true);
        }
        finally
        {
            IsClosing = false;
            Completed?.Invoke(this, EventArgs.Empty);
        }
    }
}
