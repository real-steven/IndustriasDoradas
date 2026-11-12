using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Input;
using IndustriasDoradas.Desktop.Infrastructure.LocalStorage;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Presentation.Views;

public partial class LoginView : UserControl
{
    private const string ShowPasswordLabel = "Mostrar contraseña";
    private const string HidePasswordLabel = "Ocultar contraseña";
    private bool rememberedEmailLoaded;

    public LoginView()
    {
        InitializeComponent();
        DataObject.AddCopyingHandler(RevealedPasswordBox, OnRevealedPasswordCopying);
        RememberEmailBox.Unchecked += OnRememberEmailUnchecked;
        DataContextChanged += OnDataContextChanged;
        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
    }

    private ILoginCredentialsTarget? ViewModel => DataContext as ILoginCredentialsTarget;

    public bool IsPasswordRevealed { get; private set; }

    /// <summary>
    /// Preferencia local de este equipo y usuario de Windows. Reemplazable solo para pruebas.
    /// </summary>
    public RecentEmailPreferenceStore EmailPreference { get; set; } = new();

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        HidePassword(restoreFocus: false);
        if (!rememberedEmailLoaded)
        {
            // Solo al abrir la vista; recargarla no debe pisar un correo que el usuario esté escribiendo.
            rememberedEmailLoaded = true;
            LoadRememberedEmail();
        }
        EmailBox.Focus();
        Keyboard.Focus(EmailBox);
    }

    private void OnDataContextChanged(object sender, DependencyPropertyChangedEventArgs e)
    {
        if (e.OldValue is ILoginCredentialsTarget previous) previous.CredentialsAccepted -= OnCredentialsAccepted;
        if (e.NewValue is ILoginCredentialsTarget current) current.CredentialsAccepted += OnCredentialsAccepted;
    }

    private void OnCredentialsAccepted(object? sender, EventArgs e)
    {
        // Se guarda en cuanto el acceso es válido, sin esperar la sincronización inicial,
        // que en un equipo nuevo puede tardar o fallar por la red.
        if (RememberEmailBox.IsChecked == true) EmailPreference.Remember(EmailBox.Text);
        else EmailPreference.Forget();
    }

    private void OnRememberEmailUnchecked(object sender, RoutedEventArgs e)
    {
        EmailPreference.Forget();
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        HidePassword(restoreFocus: false);
    }

    private void OnTogglePasswordVisibility(object sender, RoutedEventArgs e)
    {
        // Con mouse o toque el usuario estaba escribiendo: el foco vuelve al campo.
        // Con teclado el foco permanece en el botón, como espera un lector de pantalla.
        bool fromPointer = InputManager.Current.MostRecentInputDevice is MouseDevice
            or StylusDevice or TouchDevice;
        if (IsPasswordRevealed) HidePassword(restoreFocus: fromPointer);
        else ShowPassword(restoreFocus: fromPointer);
    }

    private void ShowPassword(bool restoreFocus)
    {
        if (IsPasswordRevealed) return;
        (int start, int length) = PasswordBoxSelection.Get(PasswordBox);
        bool focusField = restoreFocus || PasswordBox.IsKeyboardFocused;

        RevealedPasswordBox.Text = PasswordBox.Password;
        RevealedPasswordBox.Select(start, length);
        RevealedPasswordBox.Visibility = Visibility.Visible;
        PasswordBox.Visibility = Visibility.Hidden;
        IsPasswordRevealed = true;
        UpdatePasswordVisibilityButton();

        if (focusField) FocusField(RevealedPasswordBox);
    }

    private void HidePassword(bool restoreFocus)
    {
        if (!IsPasswordRevealed)
        {
            RevealedPasswordBox.Clear();
            UpdatePasswordVisibilityButton();
            return;
        }

        int start = RevealedPasswordBox.SelectionStart;
        int length = RevealedPasswordBox.SelectionLength;
        bool focusField = restoreFocus || RevealedPasswordBox.IsKeyboardFocused;

        PasswordBox.Password = RevealedPasswordBox.Text;
        RevealedPasswordBox.Clear();
        PasswordBox.Visibility = Visibility.Visible;
        RevealedPasswordBox.Visibility = Visibility.Collapsed;
        PasswordBoxSelection.Set(PasswordBox, start, length);
        IsPasswordRevealed = false;
        UpdatePasswordVisibilityButton();

        if (focusField) FocusField(PasswordBox);
    }

    private void UpdatePasswordVisibilityButton()
    {
        string label = IsPasswordRevealed ? HidePasswordLabel : ShowPasswordLabel;
        PasswordVisibilityButton.ToolTip = label;
        AutomationProperties.SetName(PasswordVisibilityButton, label);
        ShowPasswordIcon.Visibility = IsPasswordRevealed ? Visibility.Collapsed : Visibility.Visible;
        HidePasswordIcon.Visibility = IsPasswordRevealed ? Visibility.Visible : Visibility.Collapsed;
    }

    private static void FocusField(Control field)
    {
        field.Focus();
        Keyboard.Focus(field);
    }

    private static void OnRevealedPasswordCopying(object sender, DataObjectCopyingEventArgs e)
    {
        // Igual que PasswordBox: mostrar la contraseña no habilita copiarla ni cortarla.
        e.CancelCommand();
    }

    private async void OnSignIn(object sender, RoutedEventArgs e)
    {
        await SignInAsync();
    }

    private async void OnPasswordKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key != Key.Return || ViewModel?.CanInteract != true) return;
        e.Handled = true;
        await SignInAsync();
    }

    private async Task SignInAsync()
    {
        ILoginCredentialsTarget? station = ViewModel;
        if (station?.CanInteract != true) return;
        HidePassword(restoreFocus: false);
        if (station.HasRestorableSession && string.IsNullOrWhiteSpace(PasswordBox.Password))
        {
            await station.EnterRestoredSessionAsync();
            return;
        }

        // La preferencia de correo se aplica en OnCredentialsAccepted.
        await station.SignInAsync(EmailBox.Text, PasswordBox.Password);
        PasswordBox.Clear();
    }

    private async void OnRecover(object sender, RoutedEventArgs e)
    {
        if (ViewModel is not null) await ViewModel.RecoverPasswordAsync(EmailBox.Text);
    }

    private void LoadRememberedEmail()
    {
        // Load nunca lanza: archivo inexistente, ilegible o corrupto equivale a no recordar.
        string? email = EmailPreference.Load();
        if (email is null) return;
        EmailBox.Text = email;
        RememberEmailBox.IsChecked = true;
    }
}
