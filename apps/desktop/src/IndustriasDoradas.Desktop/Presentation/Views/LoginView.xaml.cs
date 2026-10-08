using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.IO;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Presentation.Views;

public partial class LoginView : UserControl
{
    private static readonly string PreferencePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "IndustriasDoradas",
        "recent-email.txt");

    public LoginView()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private StationViewModel? ViewModel => DataContext as StationViewModel;

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        LoadRememberedEmail();
        EmailBox.Focus();
        Keyboard.Focus(EmailBox);
    }

    private async void OnSignIn(object sender, RoutedEventArgs e)
    {
        if (ViewModel is null) return;
        if (ViewModel.HasRestorableSession && string.IsNullOrWhiteSpace(PasswordBox.Password))
        {
            ViewModel.EnterRestoredSession();
            return;
        }

        await ViewModel.SignInAsync(EmailBox.Text, PasswordBox.Password);
        PasswordBox.Clear();
        if (ViewModel.IsStationOpen)
        {
            SaveEmailPreference();
        }
    }

    private async void OnRecover(object sender, RoutedEventArgs e)
    {
        if (ViewModel is not null) await ViewModel.RecoverPasswordAsync(EmailBox.Text);
    }

    private void LoadRememberedEmail()
    {
        try
        {
            if (!File.Exists(PreferencePath)) return;
            string email = File.ReadAllText(PreferencePath).Trim();
            if (email.Length == 0) return;
            EmailBox.Text = email;
            RememberEmailBox.IsChecked = true;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // Recordar el correo es opcional y nunca debe impedir el inicio de sesión.
        }
    }

    private void SaveEmailPreference()
    {
        try
        {
            if (RememberEmailBox.IsChecked == true)
            {
                string? directory = Path.GetDirectoryName(PreferencePath);
                if (directory is not null) Directory.CreateDirectory(directory);
                File.WriteAllText(PreferencePath, EmailBox.Text.Trim());
            }
            else if (File.Exists(PreferencePath))
            {
                File.Delete(PreferencePath);
            }
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // La preferencia no contiene secretos y su fallo no afecta la estación.
        }
    }
}
