using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using IndustriasDoradas.Desktop.Infrastructure.LocalStorage;
using IndustriasDoradas.Desktop.Presentation.Views;

namespace IndustriasDoradas.Desktop.Tests.Presentation;

[TestClass]
public sealed class LoginViewRememberEmailTests
{
    private const string Email = "jefe@planta.test";
    private const string Password = "clave-privada-123";
    private string directory = string.Empty;
    private string preferencePath = string.Empty;

    [TestInitialize]
    public void CreateDirectory()
    {
        directory = LoginViewTestHost.NewTemporaryDirectory();
        preferencePath = Path.Combine(directory, RecentEmailPreferenceStore.FileName);
    }

    [TestCleanup]
    public void DeleteDirectory()
    {
        if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
    }

    [STATestMethod]
    public void CheckedEmailIsSavedAfterValidLoginAndRestoredOnRestart()
    {
        LoginViewTestHost.WithLogin((login, target, _) =>
        {
            Assert.AreEqual(string.Empty, EmailBox(login).Text);
            Assert.IsFalse(RememberBox(login).IsChecked == true);

            EmailBox(login).Text = Email;
            PasswordBox(login).Password = Password;
            RememberBox(login).IsChecked = true;
            Click(SignInButton(login));

            Assert.AreEqual(1, target.SignInCalls);
            Assert.AreEqual(Email, File.ReadAllText(preferencePath));
        }, preferencePath);

        // Reinicio: una vista nueva lee la misma preferencia local.
        LoginViewTestHost.WithLogin((login, _, _) =>
        {
            Assert.AreEqual(Email, EmailBox(login).Text);
            Assert.IsTrue(RememberBox(login).IsChecked == true);
            Assert.AreEqual(string.Empty, PasswordBox(login).Password);
        }, preferencePath);
    }

    [STATestMethod]
    public void EmailIsSavedEvenIfInitialSynchronizationNeverFinishes()
    {
        // En un equipo nuevo la sincronización inicial puede tardar mucho o quedarse sin red.
        var pendingSync = new TaskCompletionSource();
        var target = new FakeLoginTarget { AfterAcceptance = pendingSync.Task };

        LoginViewTestHost.WithLogin((login, _, _) =>
        {
            EmailBox(login).Text = Email;
            PasswordBox(login).Password = Password;
            RememberBox(login).IsChecked = true;
            Click(SignInButton(login));

            Assert.AreEqual(Email, new RecentEmailPreferenceStore(preferencePath).Load());
        }, preferencePath, target);

        pendingSync.SetResult();
    }

    [STATestMethod]
    public void UncheckingForgetsTheEmailAndRestartStartsEmpty()
    {
        new RecentEmailPreferenceStore(preferencePath).Remember(Email);

        LoginViewTestHost.WithLogin((login, _, _) =>
        {
            Assert.AreEqual(Email, EmailBox(login).Text);
            Assert.IsTrue(RememberBox(login).IsChecked == true);

            RememberBox(login).IsChecked = false;

            Assert.IsFalse(File.Exists(preferencePath), "Desmarcar elimina el correo de inmediato.");
        }, preferencePath);

        LoginViewTestHost.WithLogin((login, _, _) =>
        {
            Assert.AreEqual(string.Empty, EmailBox(login).Text);
            Assert.IsFalse(RememberBox(login).IsChecked == true);
        }, preferencePath);
    }

    [STATestMethod]
    public void ValidLoginWithBoxUncheckedForgetsAPreviousEmail()
    {
        File.WriteAllText(preferencePath, "anterior@planta.test");
        var target = new FakeLoginTarget();

        LoginViewTestHost.WithLogin((login, _, _) =>
        {
            RememberBox(login).IsChecked = false;
            File.WriteAllText(preferencePath, "anterior@planta.test");
            EmailBox(login).Text = Email;
            PasswordBox(login).Password = Password;
            Click(SignInButton(login));

            Assert.IsFalse(File.Exists(preferencePath));
        }, preferencePath, target);
    }

    [STATestMethod]
    public void RejectedOrOfflineLoginDoesNotStoreAnything()
    {
        var target = new FakeLoginTarget { AcceptCredentials = false };

        LoginViewTestHost.WithLogin((login, _, _) =>
        {
            EmailBox(login).Text = Email;
            PasswordBox(login).Password = Password;
            RememberBox(login).IsChecked = true;
            Click(SignInButton(login));

            Assert.AreEqual(1, target.SignInCalls);
            Assert.IsFalse(File.Exists(preferencePath), "Sin acceso válido no se guarda el correo.");
        }, preferencePath, target);
    }

    [STATestMethod]
    public void PreferenceNeverContainsPassword()
    {
        LoginViewTestHost.WithLogin((login, _, _) =>
        {
            EmailBox(login).Text = Email;
            PasswordBox(login).Password = Password;
            RememberBox(login).IsChecked = true;
            Click(SignInButton(login));
        }, preferencePath);

        string stored = File.ReadAllText(preferencePath);
        Assert.AreEqual(Email, stored);
        Assert.IsFalse(stored.Contains(Password, StringComparison.Ordinal));
        Assert.AreEqual(1, Directory.GetFiles(directory).Length, "No se crean otros archivos de sesión.");
    }

    [STATestMethod]
    public void MissingFileOpensAnEmptyLogin()
    {
        LoginViewTestHost.WithLogin((login, _, _) =>
        {
            Assert.AreEqual(string.Empty, EmailBox(login).Text);
            Assert.IsFalse(RememberBox(login).IsChecked == true);
            Assert.IsTrue(EmailBox(login).IsEnabled);
        }, preferencePath);
    }

    [STATestMethod]
    public void CorruptFileOpensAnEmptyLogin()
    {
        File.WriteAllBytes(preferencePath, [0x00, 0xFF, 0x0A, 0x40]);

        LoginViewTestHost.WithLogin((login, _, _) =>
        {
            Assert.AreEqual(string.Empty, EmailBox(login).Text);
            Assert.IsFalse(RememberBox(login).IsChecked == true);
        }, preferencePath);
    }

    [STATestMethod]
    public void RememberedEmailIsRestoredWithoutInternetOrStation()
    {
        new RecentEmailPreferenceStore(preferencePath).Remember(Email);
        if (System.Windows.Application.Current is null) new App().InitializeComponent();
        LoginViewTestHost.KeepSharedApplicationAlive();

        // Sin estación ni API: la preferencia es un archivo local y no consulta la red.
        var login = new LoginView { EmailPreference = new RecentEmailPreferenceStore(preferencePath) };
        var window = new Window { Content = login, ShowInTaskbar = false, WindowStyle = WindowStyle.None };
        try
        {
            window.Show();
            Assert.AreEqual(Email, EmailBox(login).Text);
            Assert.IsTrue(RememberBox(login).IsChecked == true);
        }
        finally
        {
            window.Close();
        }
    }

    private static TextBox EmailBox(LoginView login) => (TextBox)login.FindName("EmailBox");

    private static PasswordBox PasswordBox(LoginView login) => (PasswordBox)login.FindName("PasswordBox");

    private static CheckBox RememberBox(LoginView login) => (CheckBox)login.FindName("RememberEmailBox");

    private static Button SignInButton(LoginView login) =>
        LogicalChildren<Button>(login).Single(button =>
            System.Windows.Automation.AutomationProperties.GetName(button) == "Abrir estación o sesión");

    private static void Click(Button button) => button.RaiseEvent(new RoutedEventArgs(ButtonBase.ClickEvent, button));

    private static IEnumerable<T> LogicalChildren<T>(DependencyObject parent)
        where T : DependencyObject
    {
        foreach (object child in LogicalTreeHelper.GetChildren(parent))
        {
            if (child is not DependencyObject element) continue;
            if (element is T match) yield return match;
            foreach (T descendant in LogicalChildren<T>(element)) yield return descendant;
        }
    }
}
