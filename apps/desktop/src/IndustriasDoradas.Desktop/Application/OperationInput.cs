namespace IndustriasDoradas.Desktop.Application;

public enum OperationInputAction
{
    SelectLine,
    RegisterCajuela,
    MoveUp,
    MoveDown,
    MoveLeft,
    MoveRight,
    Confirm,
    RevertLastCajuela,
    Cancel,
}

public sealed record OperationInputOrigin(
    string SourceKind,
    string ControllerId,
    string SignalCode,
    int LineSlot,
    bool IsRepeat)
{
    public static OperationInputOrigin Click(OperationInputAction action, int lineSlot = 1) =>
        new("CLICK", "shared-pointer", action.ToString(), lineSlot, false);

    public static OperationInputOrigin Application(int lineSlot = 1) =>
        new("APPLICATION", "application", "DIRECT", lineSlot, false);

    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(SourceKind) ||
            string.IsNullOrWhiteSpace(ControllerId) ||
            string.IsNullOrWhiteSpace(SignalCode) ||
            LineSlot is < 1 or > 4)
        {
            throw new ArgumentException("El origen del comando de entrada es inválido.");
        }
    }
}

public sealed record OperationInputCommand(
    Guid CommandId,
    OperationInputAction Action,
    OperationInputOrigin Origin,
    DateTimeOffset OccurredAt);

public static class OperationInputActionParser
{
    public static bool TryParse(
        string specification,
        int defaultLineSlot,
        out OperationInputAction action,
        out int lineSlot)
    {
        action = default;
        lineSlot = defaultLineSlot;
        if (string.IsNullOrWhiteSpace(specification))
        {
            return false;
        }

        string[] parts = specification.Split(':', 2, StringSplitOptions.TrimEntries);
        if (!Enum.TryParse(parts[0], ignoreCase: true, out action))
        {
            return false;
        }

        if (parts.Length == 2 &&
            (!int.TryParse(parts[1], System.Globalization.CultureInfo.InvariantCulture, out lineSlot) ||
             lineSlot is < 1 or > 4))
        {
            return false;
        }

        return lineSlot is >= 1 and <= 4;
    }
}
