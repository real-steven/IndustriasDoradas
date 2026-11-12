namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

/// <summary>
/// Operaciones que la vista de inicio de sesión necesita. La contraseña solo viaja
/// como argumento de <see cref="SignInAsync"/>; nunca se expone como propiedad.
/// </summary>
public interface ILoginCredentialsTarget
{
    /// <summary>
    /// Se produce en cuanto el servidor acepta las credenciales escritas, antes de la
    /// sincronización inicial, para que las preferencias locales no dependan de ella.
    /// </summary>
    event EventHandler? CredentialsAccepted;

    bool CanInteract { get; }
    bool HasRestorableSession { get; }
    bool IsStationOpen { get; }
    Task SignInAsync(string email, string password);
    Task EnterRestoredSessionAsync();
    Task RecoverPasswordAsync(string email);
}
