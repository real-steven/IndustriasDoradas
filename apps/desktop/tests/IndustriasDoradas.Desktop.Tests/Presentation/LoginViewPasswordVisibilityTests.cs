using System.Windows;
using System.Windows.Automation;
using System.Windows.Automation.Peers;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using IndustriasDoradas.Desktop.Presentation.Views;

namespace IndustriasDoradas.Desktop.Tests.Presentation;

[TestClass]
public sealed class LoginViewPasswordVisibilityTests
{
    private const string Secret = "Clave ñ 123 €";

    [STATestMethod]
    public void PasswordStartsHiddenWithAccessibleShowButton()
    {
        WithLogin((login, _, _) =>
        {
            Assert.IsFalse(login.IsPasswordRevealed);
            Assert.AreEqual(Visibility.Visible, PasswordBox(login).Visibility);
            Assert.AreEqual(Visibility.Collapsed, RevealedBox(login).Visibility);
            Assert.AreEqual(string.Empty, RevealedBox(login).Text);

            Button toggle = ToggleButton(login);
            Assert.AreEqual("Mostrar contraseña", AutomationProperties.GetName(toggle));
            Assert.AreEqual("Mostrar contraseña", toggle.ToolTip);
            Assert.AreEqual("Mostrar contraseña", new ButtonAutomationPeer(toggle).GetName());
            Assert.IsTrue(toggle.Focusable);
            Assert.IsTrue(toggle.IsTabStop);
            Assert.AreEqual(Visibility.Visible, Icon(login, "ShowPasswordIcon").Visibility);
            Assert.AreEqual(Visibility.Collapsed, Icon(login, "HidePasswordIcon").Visibility);
        });
    }

    [STATestMethod]
    public void ShowingAndHidingKeepsExactContentCaretAndFocus()
    {
        WithLogin((login, _, _) =>
        {
            PasswordBox hidden = PasswordBox(login);
            TextBox revealed = RevealedBox(login);
            hidden.Password = Secret;
            Focus(hidden);

            Click(ToggleButton(login));

            Assert.IsTrue(login.IsPasswordRevealed);
            Assert.AreEqual(Visibility.Visible, revealed.Visibility);
            Assert.AreNotEqual(Visibility.Visible, hidden.Visibility);
            Assert.AreEqual(Secret, revealed.Text);
            Assert.IsTrue(revealed.IsKeyboardFocused, "El foco debe pasar al campo visible.");
            Assert.AreEqual("Ocultar contraseña", AutomationProperties.GetName(ToggleButton(login)));
            Assert.AreEqual("Ocultar contraseña", ToggleButton(login).ToolTip);
            Assert.AreEqual(Visibility.Visible, Icon(login, "HidePasswordIcon").Visibility);
            Assert.AreEqual(Visibility.Collapsed, Icon(login, "ShowPasswordIcon").Visibility);

            revealed.Select(3, 0);
            Click(ToggleButton(login));

            Assert.IsFalse(login.IsPasswordRevealed);
            Assert.AreEqual(Secret, hidden.Password, "Ocultar no debe perder ni duplicar caracteres.");
            Assert.AreEqual(string.Empty, revealed.Text, "El texto visible no debe quedar en memoria del control.");
            Assert.IsTrue(hidden.IsKeyboardFocused, "El foco debe volver al campo oculto.");

            Click(ToggleButton(login));

            Assert.AreEqual(Secret, revealed.Text);
            Assert.AreEqual(3, revealed.CaretIndex, "El cursor debe conservar su posición en ambos sentidos.");
        });
    }

    [STATestMethod]
    public void KeyboardActivationTogglesWithoutSubmittingAndKeepsFocusOnButton()
    {
        WithLogin((login, target, _) =>
        {
            PasswordBox(login).Password = Secret;
            Button toggle = ToggleButton(login);
            Focus(toggle);

            Click(toggle);
            Assert.IsTrue(login.IsPasswordRevealed);
            Assert.IsTrue(toggle.IsKeyboardFocused);

            Click(toggle);
            Assert.IsFalse(login.IsPasswordRevealed);
            Assert.IsTrue(toggle.IsKeyboardFocused);
            Assert.AreEqual(0, target.SignInCalls, "El botón del ojo nunca envía el formulario.");
            Assert.AreEqual(Secret, PasswordBox(login).Password);
        });
    }

    [STATestMethod]
    public void EnterInVisiblePasswordSubmitsEditedValueAndHidesItAgain()
    {
        WithLogin((login, target, _) =>
        {
            ((TextBox)login.FindName("EmailBox")).Text = "jefe@planta.test";
            PasswordBox(login).Password = "Clave";
            Click(ToggleButton(login));
            TextBox revealed = RevealedBox(login);
            revealed.Text += " editada";

            PressEnter(revealed);

            Assert.AreEqual(1, target.SignInCalls);
            Assert.AreEqual("jefe@planta.test", target.LastEmail);
            Assert.AreEqual("Clave editada", target.LastPassword);
            Assert.IsFalse(login.IsPasswordRevealed);
            Assert.AreEqual(string.Empty, revealed.Text);
            Assert.AreEqual(string.Empty, PasswordBox(login).Password);
        });
    }

    [STATestMethod]
    public void EnterInHiddenPasswordStillSubmits()
    {
        WithLogin((login, target, _) =>
        {
            ((TextBox)login.FindName("EmailBox")).Text = "jefe@planta.test";
            PasswordBox(login).Password = Secret;

            PressEnter(PasswordBox(login));

            Assert.AreEqual(1, target.SignInCalls);
            Assert.AreEqual(Secret, target.LastPassword);
        });
    }

    [STATestMethod]
    public void ReloadingTheViewReturnsToHiddenState()
    {
        WithLogin((login, _, window) =>
        {
            PasswordBox(login).Password = Secret;
            Click(ToggleButton(login));
            Assert.IsTrue(login.IsPasswordRevealed);

            login.RaiseEvent(new RoutedEventArgs(FrameworkElement.UnloadedEvent, login));
            Assert.IsFalse(login.IsPasswordRevealed);
            Assert.AreEqual(string.Empty, RevealedBox(login).Text);
            Assert.AreEqual(Secret, PasswordBox(login).Password);

            Click(ToggleButton(login));
            login.RaiseEvent(new RoutedEventArgs(FrameworkElement.LoadedEvent, login));
            Assert.IsFalse(login.IsPasswordRevealed);
            Assert.AreEqual(Visibility.Visible, PasswordBox(login).Visibility);
            Assert.AreEqual("Mostrar contraseña", AutomationProperties.GetName(ToggleButton(login)));
        });
    }

    [STATestMethod]
    public void PasswordFieldKeepsOriginalHeightAndLeavesRoomForTheEye()
    {
        WithLogin((login, _, _) =>
        {
            var field = (Grid)login.FindName("PasswordField");
            Assert.AreEqual(48d, field.ActualHeight, 0.1d);
            Assert.AreEqual(48d, PasswordBox(login).ActualHeight, 0.1d);
            Button toggle = ToggleButton(login);
            Assert.IsTrue(PasswordBox(login).Padding.Right >= toggle.Width + toggle.Margin.Right);
            Assert.AreEqual(PasswordBox(login).Padding, RevealedBox(login).Padding);
        });
    }

    private static void WithLogin(Action<LoginView, FakeLoginTarget, Window> assertions) =>
        LoginViewTestHost.WithLogin(assertions);

    private static PasswordBox PasswordBox(LoginView login) => (PasswordBox)login.FindName("PasswordBox");

    private static TextBox RevealedBox(LoginView login) => (TextBox)login.FindName("RevealedPasswordBox");

    private static Button ToggleButton(LoginView login) => (Button)login.FindName("PasswordVisibilityButton");

    private static UIElement Icon(LoginView login, string name) => (UIElement)login.FindName(name);

    private static void Click(Button button) => button.RaiseEvent(new RoutedEventArgs(ButtonBase.ClickEvent, button));

    private static void Focus(UIElement element)
    {
        element.Focus();
        Keyboard.Focus(element);
    }

    private static void PressEnter(UIElement element)
    {
        PresentationSource source = PresentationSource.FromVisual(element)
            ?? throw new AssertFailedException("La vista debe estar visible.");
        element.RaiseEvent(new KeyEventArgs(Keyboard.PrimaryDevice, source, 0, Key.Return)
        {
            RoutedEvent = Keyboard.KeyDownEvent,
        });
    }

}
