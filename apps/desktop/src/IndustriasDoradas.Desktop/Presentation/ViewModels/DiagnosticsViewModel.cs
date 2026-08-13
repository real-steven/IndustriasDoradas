using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Domain;
using System.Globalization;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed class DiagnosticsViewModel : ObservableObject
{
    private readonly IHealthService healthService;
    private HealthState state = HealthState.NotChecked;
    private string statusTitle = "Sin comprobar";
    private string statusMessage = "Ejecuta la comprobación para consultar la API.";
    private string service = "—";
    private string lastChecked = "—";

    public DiagnosticsViewModel(IHealthService healthService)
    {
        this.healthService = healthService;
        RefreshCommand = new AsyncRelayCommand(RefreshAsync);
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

    public async Task RefreshAsync(CancellationToken cancellationToken = default)
    {
        State = HealthState.Checking;
        StatusTitle = "Comprobando conexión";
        StatusMessage = "Consultando el endpoint técnico de la API.";

        SystemHealth result = await healthService.CheckAsync(cancellationToken);

        State = result.State;
        StatusTitle = result.State == HealthState.Available
            ? "API disponible"
            : "API no disponible";
        StatusMessage = result.Detail;
        Service = result.Service;
        LastChecked = result.CheckedAt?.ToLocalTime().ToString(
            "g",
            CultureInfo.CurrentCulture) ?? "—";
    }
}
