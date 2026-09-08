using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Presentation.Views;

public partial class StationView : UserControl
{
    public StationView()
    {
        InitializeComponent();
        PreviewKeyDown += OnActivity;
        PreviewMouseDown += OnActivity;
    }

    private StationViewModel? ViewModel => DataContext as StationViewModel;
    private async void OnSignIn(object sender, RoutedEventArgs e) { if (ViewModel is not null) await ViewModel.SignInAsync(EmailBox.Text, PasswordBox.Password); PasswordBox.Clear(); }
    private async void OnRecover(object sender, RoutedEventArgs e) { if (ViewModel is not null) await ViewModel.RecoverPasswordAsync(EmailBox.Text); }
    private async void OnElevate(object sender, RoutedEventArgs e) { if (ViewModel is not null) await ViewModel.ElevateAsync(PinBox.Password); PinBox.Clear(); }
    private void OnActivity(object sender, InputEventArgs e) => ViewModel?.RecordActivity();
}
