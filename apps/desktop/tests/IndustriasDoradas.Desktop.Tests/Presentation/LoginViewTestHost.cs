using System.IO;
using System.Windows;
using IndustriasDoradas.Desktop.Infrastructure.LocalStorage;
using IndustriasDoradas.Desktop.Presentation.ViewModels;
using IndustriasDoradas.Desktop.Presentation.Views;

namespace IndustriasDoradas.Desktop.Tests.Presentation;

/// <summary>Muestra <see cref="LoginView"/> en una ventana real con preferencias en una ruta temporal.</summary>
internal static class LoginViewTestHost
{
    public static void WithLogin(
        Action<LoginView, FakeLoginTarget, Window> assertions,
        string? preferencePath = null,
        FakeLoginTarget? target = null)
    {
        if (System.Windows.Application.Current is null)
        {
            var application = new App();
            application.InitializeComponent();
        }
        KeepSharedApplicationAlive();

        string? temporaryDirectory = null;
        if (preferencePath is null)
        {
            temporaryDirectory = NewTemporaryDirectory();
            preferencePath = Path.Combine(temporaryDirectory, RecentEmailPreferenceStore.FileName);
        }

        target ??= new FakeLoginTarget();
        var login = new LoginView
        {
            // Nunca se toca la preferencia real del usuario que ejecuta las pruebas.
            EmailPreference = new RecentEmailPreferenceStore(preferencePath),
            DataContext = target,
        };
        var window = new Window
        {
            Content = login,
            Width = 900,
            Height = 640,
            ShowActivated = true,
            ShowInTaskbar = false,
            WindowStyle = WindowStyle.None,
        };
        try
        {
            window.Show();
            window.Activate();
            window.UpdateLayout();
            assertions(login, target, window);
        }
        finally
        {
            window.Close();
            if (temporaryDirectory is not null) Directory.Delete(temporaryDirectory, recursive: true);
        }
    }

    public static string NewTemporaryDirectory()
    {
        string directory = Path.Combine(Path.GetTempPath(), "id-login-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        return directory;
    }

    public static void KeepSharedApplicationAlive()
    {
        // Cerrar una ventana de prueba no debe apagar la aplicación compartida por otras pruebas.
        // Solo el hilo dueño de la aplicación puede cambiarla; en otros hilos las ventanas no son
        // ventanas de la aplicación y su cierre no la apaga.
        System.Windows.Application? application = System.Windows.Application.Current;
        if (application?.Dispatcher.CheckAccess() == true)
        {
            application.ShutdownMode = ShutdownMode.OnExplicitShutdown;
        }
    }
}

internal sealed class FakeLoginTarget : ILoginCredentialsTarget
{
    public event EventHandler? CredentialsAccepted;

    public bool CanInteract => true;
    public bool HasRestorableSession { get; init; }
    public bool IsStationOpen { get; private set; }
    // Propiedades leídas por los bindings de LoginView.xaml.
    public bool NeedsCredentials { get; } = true;
    public string LoginSessionColor { get; } = "#62D78B";
    public string LoginSessionTitle { get; } = "Sin sesión";
    public string LoginSessionDescription { get; } = "Ingrese sus credenciales.";
    public string LoginPrompt { get; } = "Ingrese sus credenciales.";
    public string LoginActionLabel { get; } = "ABRIR ESTACIÓN  →";
    public string Status { get; } = string.Empty;

    /// <summary>false simula credenciales rechazadas o falta de Internet antes de validar.</summary>
    public bool AcceptCredentials { get; init; } = true;

    /// <summary>Tarea que representa la sincronización posterior a validar las credenciales.</summary>
    public Task AfterAcceptance { get; init; } = Task.CompletedTask;

    public int SignInCalls { get; private set; }
    public int RestoredSessionCalls { get; private set; }
    public string? LastEmail { get; private set; }
    public string? LastPassword { get; private set; }

    public Task SignInAsync(string email, string password)
    {
        SignInCalls++;
        LastEmail = email;
        LastPassword = password;
        if (!AcceptCredentials) return Task.CompletedTask;
        IsStationOpen = true;
        CredentialsAccepted?.Invoke(this, EventArgs.Empty);
        return AfterAcceptance;
    }

    public Task EnterRestoredSessionAsync()
    {
        RestoredSessionCalls++;
        return Task.CompletedTask;
    }

    public Task RecoverPasswordAsync(string email) => Task.CompletedTask;
}
