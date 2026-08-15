using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

public sealed class MainWindowViewModel : ObservableObject
{
    private object currentPage;

    public MainWindowViewModel(
        HomeViewModel home,
        DiagnosticsViewModel diagnostics)
    {
        Home = home;
        Diagnostics = diagnostics;
        currentPage = home;
        ShowHomeCommand = new RelayCommand(() => CurrentPage = Home);
        ShowDiagnosticsCommand = new RelayCommand(() => CurrentPage = Diagnostics);
    }

    public HomeViewModel Home { get; }

    public DiagnosticsViewModel Diagnostics { get; }

    public object CurrentPage
    {
        get => currentPage;
        private set => SetProperty(ref currentPage, value);
    }

    public IRelayCommand ShowHomeCommand { get; }

    public IRelayCommand ShowDiagnosticsCommand { get; }

    public Task InitializeAsync() => Diagnostics.RefreshAsync();
}
