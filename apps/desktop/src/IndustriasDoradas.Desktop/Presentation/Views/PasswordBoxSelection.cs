using System.Reflection;
using System.Windows.Controls;

namespace IndustriasDoradas.Desktop.Presentation.Views;

/// <summary>
/// Lee y restaura la selección de un <see cref="PasswordBox"/>, que WPF no expone públicamente.
/// Si la API interna no está disponible, el cursor queda al final sin perder el contenido.
/// </summary>
internal static class PasswordBoxSelection
{
    private const BindingFlags InstanceMembers =
        BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

    private static readonly PropertyInfo? SelectionProperty =
        typeof(PasswordBox).GetProperty("Selection", InstanceMembers);

    private static readonly MethodInfo? SelectMethod =
        typeof(PasswordBox).GetMethod("Select", InstanceMembers, [typeof(int), typeof(int)]);

    public static (int Start, int Length) Get(PasswordBox passwordBox)
    {
        int end = passwordBox.Password.Length;
        try
        {
            object? selection = SelectionProperty?.GetValue(passwordBox);
            Type? range = selection?.GetType().GetInterface("System.Windows.Documents.ITextRange");
            int? start = Offset(range?.GetProperty("Start")?.GetValue(selection));
            int? finish = Offset(range?.GetProperty("End")?.GetValue(selection));
            if (start is null || finish is null) return (end, 0);

            int clampedStart = Math.Clamp(Math.Min(start.Value, finish.Value), 0, end);
            int clampedEnd = Math.Clamp(Math.Max(start.Value, finish.Value), 0, end);
            return (clampedStart, clampedEnd - clampedStart);
        }
        catch (Exception exception) when (IsReflectionFailure(exception))
        {
            return (end, 0);
        }
    }

    public static void Set(PasswordBox passwordBox, int start, int length)
    {
        int end = passwordBox.Password.Length;
        int clampedStart = Math.Clamp(start, 0, end);
        int clampedLength = Math.Clamp(length, 0, end - clampedStart);
        try
        {
            SelectMethod?.Invoke(passwordBox, [clampedStart, clampedLength]);
        }
        catch (Exception exception) when (IsReflectionFailure(exception))
        {
            // Restaurar el cursor es una comodidad; el valor de la contraseña ya está intacto.
        }
    }

    private static int? Offset(object? textPointer) =>
        textPointer?.GetType()
            .GetInterface("System.Windows.Documents.ITextPointer")
            ?.GetProperty("Offset")
            ?.GetValue(textPointer) as int?;

    private static bool IsReflectionFailure(Exception exception) =>
        exception is TargetInvocationException
            or TargetException
            or MemberAccessException
            or ArgumentException
            or InvalidOperationException
            or AmbiguousMatchException;
}
