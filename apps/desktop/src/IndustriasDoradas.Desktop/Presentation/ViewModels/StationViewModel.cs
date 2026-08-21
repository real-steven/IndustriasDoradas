using System.Net.Http;
using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Domain;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed class StationViewModel : ObservableObject, IDisposable
{
    private readonly StationCoordinator coordinator;
    private readonly PrivilegeModeController modeController;
    private readonly DispatcherTimer idleTimer;
    private ProtectedStationState? state;
    private string status = "Inicia sesión como jefe de planta para abrir la estación.";
    private StationMode mode = StationMode.SignedOut;
    private bool isBusy;
    private string draft = string.Empty;

    public StationViewModel(StationCoordinator coordinator, IOptions<StationOptions> options, TimeProvider timeProvider)
    {
        this.coordinator = coordinator;
        modeController = new PrivilegeModeController(timeProvider, TimeSpan.FromSeconds(options.Value.PrivilegedIdleSeconds));
        ExitManagerModeCommand = new RelayCommand(ExitManagerMode);
        idleTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) };
        idleTimer.Tick += OnIdleTick;
        idleTimer.Start();
    }

    public string Status { get => status; private set => SetProperty(ref status, value); }
    public StationMode Mode { get => mode; private set => SetProperty(ref mode, value); }
    public bool IsBusy { get => isBusy; private set => SetProperty(ref isBusy, value); }
    public string Draft
    {
        get => draft;
        set { if (SetProperty(ref draft, value)) modeController.Draft = value; }
    }
    public IRelayCommand ExitManagerModeCommand { get; }

    public async Task InitializeAsync()
    {
        state = await coordinator.ResumeAsync(networkAvailable: true).ConfigureAwait(true);
        if (state is not null) OpenOperationMode("Estación revalidada. Modo Operación activo.");
    }

    public Task SignInAsync(string email, string password) => RunAsync(async () =>
    {
        state = await coordinator.SignInAsync(email, password).ConfigureAwait(true);
        OpenOperationMode("Estación abierta. Modo Operación activo.");
    }, "No se pudo abrir la estación.");

    public async Task ElevateAsync(string pin)
    {
        if (state is null) { Status = "Primero abre la estación."; return; }
        await RunAsync(async () =>
        {
            PinAttemptResponse result = await coordinator.ElevateAsync(state, pin, networkAvailable: true).ConfigureAwait(true);
            if (result.Result == "ACCEPTED")
            {
                modeController.EnterPlantManagerMode();
                Mode = modeController.Mode;
                Status = "Modo Jefe de Planta activo. Se cerrará tras dos minutos de inactividad total.";
            }
            else Status = $"Elevación rechazada: {result.Result}. Modo Operación continúa activo.";
        }, "No se pudo validar el PIN; Modo Operación continúa activo.");
    }

    public Task RecoverPasswordAsync(string email) => RunAsync(async () =>
    {
        await coordinator.RequestPasswordRecoveryAsync(email).ConfigureAwait(true);
        Status = "Si la cuenta existe, Supabase envió las instrucciones de recuperación.";
    }, "No se pudo solicitar la recuperación.");

    public void RecordActivity() => modeController.RecordActivity();
    public void Dispose() { idleTimer.Stop(); idleTimer.Tick -= OnIdleTick; GC.SuppressFinalize(this); }

    private async Task RunAsync(Func<Task> action, string failure)
    {
        IsBusy = true;
        try { await action().ConfigureAwait(true); }
        catch (Exception exception) when (exception is HttpRequestException or InvalidOperationException or UnauthorizedAccessException) { Status = failure; }
        finally { IsBusy = false; }
    }

    private void OpenOperationMode(string message) { modeController.OpenOperationMode(); Mode = modeController.Mode; Status = message; }
    private void ExitManagerMode() { modeController.ExitPlantManagerMode(); Mode = modeController.Mode; Status = "Modo Operación activo."; }
    private void OnIdleTick(object? sender, EventArgs e)
    {
        if (!modeController.EvaluateIdleTimeout()) return;
        Mode = modeController.Mode;
        Status = "Modo Jefe de Planta cerrado por inactividad. El borrador se conserva.";
    }
}
