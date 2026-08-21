using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed class MainWindowViewModel : ObservableObject
{
    private object currentPage;

    public MainWindowViewModel(HomeViewModel home, DiagnosticsViewModel diagnostics)
        : this(home, diagnostics, null)
    {
    }

    public MainWindowViewModel(
        HomeViewModel home,
        DiagnosticsViewModel diagnostics,
        StationViewModel? station)
    {
        Home = home;
        Diagnostics = diagnostics;
        Station = station;
        currentPage = station is null ? home : station;
        ShowHomeCommand = new RelayCommand(() => CurrentPage = Home);
        ShowDiagnosticsCommand = new RelayCommand(() => CurrentPage = Diagnostics);
        ShowStationCommand = new RelayCommand(
            () => CurrentPage = Station!,
            () => Station is not null);
    }

    public HomeViewModel Home { get; }

    public DiagnosticsViewModel Diagnostics { get; }
    public StationViewModel? Station { get; }

    public object CurrentPage
    {
        get => currentPage;
        private set => SetProperty(ref currentPage, value);
    }

    public IRelayCommand ShowHomeCommand { get; }

    public IRelayCommand ShowDiagnosticsCommand { get; }
    public IRelayCommand ShowStationCommand { get; }

    public async Task InitializeAsync()
    {
        await Diagnostics.RefreshAsync();
        if (Station is not null)
        {
            await Station.InitializeAsync();
        }
    }
}
