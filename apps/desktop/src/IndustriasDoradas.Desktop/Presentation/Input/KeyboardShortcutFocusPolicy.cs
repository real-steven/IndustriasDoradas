using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;

namespace IndustriasDoradas.Desktop.Presentation.Input;

/// <summary>
/// Decide cuándo una tecla debe quedarse en el control enfocado en lugar de ejecutar un atajo:
/// mientras se escribe en un campo de texto, contraseña, búsqueda, selector de hora o de fecha.
/// </summary>
public static class KeyboardShortcutFocusPolicy
{
    public static bool IsTextEntry(object? element)
    {
        for (DependencyObject? current = element as DependencyObject; current is not null; current = Parent(current))
        {
            switch (current)
            {
                case TextBoxBase { IsReadOnly: false }:
                case PasswordBox:
                case ComboBox { IsEditable: true }:
                case DatePicker:
                case Calendar:
                    return true;
            }
        }

        return false;
    }

    /// <summary>Ctrl, Alt o Windows indican combinaciones del sistema (copiar, Alt+F4...), no atajos.</summary>
    public static bool HasBlockingModifier(ModifierKeys modifiers) =>
        (modifiers & (ModifierKeys.Control | ModifierKeys.Alt | ModifierKeys.Windows)) != 0;

    /// <summary>WPF entrega las teclas pulsadas con Alt como <see cref="Key.System"/>.</summary>
    public static Key ActualKey(KeyEventArgs e) => e.Key == Key.System ? e.SystemKey : e.Key;

    public static bool ShouldIgnore(KeyEventArgs e) =>
        e.Key == Key.System ||
        HasBlockingModifier(Keyboard.Modifiers) ||
        IsTextEntry(e.OriginalSource) ||
        IsTextEntry(Keyboard.FocusedElement);

    private static DependencyObject? Parent(DependencyObject current) =>
        current is Visual or System.Windows.Media.Media3D.Visual3D
            ? VisualTreeHelper.GetParent(current) ?? LogicalTreeHelper.GetParent(current)
            : LogicalTreeHelper.GetParent(current);
}
