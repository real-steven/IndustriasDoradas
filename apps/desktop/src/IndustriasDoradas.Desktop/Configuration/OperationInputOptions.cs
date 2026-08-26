using IndustriasDoradas.Desktop.Application;

namespace IndustriasDoradas.Desktop.Configuration;

public sealed class OperationInputOptions
{
    public const string SectionName = "OperationInput";

    public List<InputControllerOptions> Controllers { get; init; } = [];

    public bool IsValid()
    {
        if (Controllers.Count == 0 ||
            Controllers.Select(controller => controller.Id).Distinct(StringComparer.OrdinalIgnoreCase).Count() !=
            Controllers.Count)
        {
            return false;
        }

        foreach (InputControllerOptions controller in Controllers)
        {
            if (string.IsNullOrWhiteSpace(controller.Id) ||
                string.IsNullOrWhiteSpace(controller.AdapterKind) ||
                controller.LineSlot is < 1 or > 4 ||
                controller.Bindings.Count == 0 ||
                controller.Bindings.Any(binding =>
                    string.IsNullOrWhiteSpace(binding.Key) ||
                    !OperationInputActionParser.TryParse(
                        binding.Value,
                        controller.LineSlot,
                        out _,
                        out _)))
            {
                return false;
            }
        }

        InputControllerOptions? keyboard = Controllers.FirstOrDefault(
            controller => string.Equals(controller.AdapterKind, "KEYBOARD", StringComparison.OrdinalIgnoreCase));
        if (keyboard is null)
        {
            return false;
        }

        HashSet<OperationInputAction> keyboardActions = keyboard.Bindings.Values
            .Select(value => OperationInputActionParser.TryParse(
                value,
                keyboard.LineSlot,
                out OperationInputAction action,
                out _)
                ? action
                : (OperationInputAction?)null)
            .OfType<OperationInputAction>()
            .ToHashSet();
        return RequiredKeyboardActions.All(keyboardActions.Contains);
    }

    private static readonly OperationInputAction[] RequiredKeyboardActions =
    [
        OperationInputAction.SelectLine,
        OperationInputAction.RegisterCajuela,
        OperationInputAction.MoveUp,
        OperationInputAction.MoveDown,
        OperationInputAction.MoveLeft,
        OperationInputAction.MoveRight,
        OperationInputAction.Confirm,
        OperationInputAction.RevertLastCajuela,
        OperationInputAction.Cancel,
    ];
}

public sealed class InputControllerOptions
{
    public string Id { get; init; } = string.Empty;
    public string AdapterKind { get; init; } = string.Empty;
    public int LineSlot { get; init; } = 1;
    public Dictionary<string, string> Bindings { get; init; } = new(StringComparer.OrdinalIgnoreCase);
}
