using IndustriasDoradas.Desktop.Configuration;

namespace IndustriasDoradas.Desktop.Application;

/// <summary>Acciones de Operación cuya tecla puede elegir el jefe de planta.</summary>
public enum KeyboardShortcutAction
{
    AddCajuela,
    AddFiveCajuelas,
    SubtractCajuela,
    OpenSweep,
    Confirm,
    Cancel,
}

/// <summary>
/// Teclas asignadas a cada acción configurable. Los nombres son los de
/// <c>System.Windows.Input.Key</c> (por ejemplo <c>Add</c>, <c>D5</c>, <c>Return</c>).
/// </summary>
public sealed record KeyboardShortcutMap(IReadOnlyDictionary<KeyboardShortcutAction, IReadOnlyList<string>> Bindings)
{
    public static KeyboardShortcutMap Default { get; } = new(new Dictionary<KeyboardShortcutAction, IReadOnlyList<string>>
    {
        [KeyboardShortcutAction.AddCajuela] = ["Add", "OemPlus"],
        [KeyboardShortcutAction.AddFiveCajuelas] = ["D5", "NumPad5"],
        [KeyboardShortcutAction.SubtractCajuela] = ["Subtract", "OemMinus"],
        [KeyboardShortcutAction.OpenSweep] = ["B"],
        [KeyboardShortcutAction.Confirm] = ["Return"],
        [KeyboardShortcutAction.Cancel] = ["Escape"],
    });

    public IReadOnlyList<string> KeysFor(KeyboardShortcutAction action) =>
        Bindings.TryGetValue(action, out IReadOnlyList<string>? keys) ? keys : [];

    public bool TryFindAction(string keyName, out KeyboardShortcutAction action)
    {
        foreach ((KeyboardShortcutAction candidate, IReadOnlyList<string> keys) in Bindings)
        {
            if (keys.Any(key => string.Equals(key, keyName, StringComparison.OrdinalIgnoreCase)))
            {
                action = candidate;
                return true;
            }
        }

        action = default;
        return false;
    }

    public KeyboardShortcutMap With(KeyboardShortcutAction action, string keyName)
    {
        var bindings = new Dictionary<KeyboardShortcutAction, IReadOnlyList<string>>(Bindings)
        {
            [action] = [keyName],
        };
        return new KeyboardShortcutMap(bindings);
    }

    public bool HasSameBindings(KeyboardShortcutMap other) =>
        Enum.GetValues<KeyboardShortcutAction>().All(action =>
            KeysFor(action).SequenceEqual(other.KeysFor(action), StringComparer.OrdinalIgnoreCase));

    public static OperationInputAction ToInputAction(KeyboardShortcutAction action) => action switch
    {
        KeyboardShortcutAction.AddCajuela => OperationInputAction.RegisterCajuela,
        KeyboardShortcutAction.AddFiveCajuelas => OperationInputAction.RegisterFiveCajuelas,
        KeyboardShortcutAction.SubtractCajuela => OperationInputAction.RevertLastCajuela,
        KeyboardShortcutAction.OpenSweep => OperationInputAction.PrepareSweep,
        KeyboardShortcutAction.Confirm => OperationInputAction.Confirm,
        KeyboardShortcutAction.Cancel => OperationInputAction.Cancel,
        _ => throw new ArgumentOutOfRangeException(nameof(action), action, "Acción de atajo desconocida."),
    };

    /// <summary>Acciones de entrada que, con atajos personalizados, solo se activan por esos atajos.</summary>
    public static bool IsConfigurable(OperationInputAction action) => action is
        OperationInputAction.RegisterCajuela or
        OperationInputAction.RegisterFiveCajuelas or
        OperationInputAction.RevertLastCajuela or
        OperationInputAction.PrepareSweep or
        OperationInputAction.Confirm or
        OperationInputAction.Cancel;
}

/// <summary>Resultado de intentar asignar una tecla a una acción.</summary>
public sealed record KeyboardShortcutValidation(bool IsAllowed, string Message);

/// <summary>
/// Reglas que impiden teclas reservadas por Windows o por la estación y asignaciones repetidas.
/// </summary>
public sealed class KeyboardShortcutRules
{
    private static readonly Dictionary<string, string> ReservedKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        ["None"] = "Esa tecla no se pudo reconocer.",
        ["Tab"] = "Tab está reservada para moverse entre botones y campos.",
        ["System"] = "Las combinaciones con Alt están reservadas para Windows (por ejemplo, Alt+F4 cierra la ventana).",
        ["LeftAlt"] = "Alt está reservada para Windows.",
        ["RightAlt"] = "Alt está reservada para Windows.",
        ["LeftCtrl"] = "Ctrl sola no puede usarse como atajo.",
        ["RightCtrl"] = "Ctrl sola no puede usarse como atajo.",
        ["LeftShift"] = "Mayús sola no puede usarse como atajo.",
        ["RightShift"] = "Mayús sola no puede usarse como atajo.",
        ["LWin"] = "La tecla Windows está reservada para el sistema.",
        ["RWin"] = "La tecla Windows está reservada para el sistema.",
        ["Apps"] = "La tecla de menú está reservada para el sistema.",
        ["F11"] = "F11 está reservada para la pantalla completa.",
        ["Capital"] = "Bloq Mayús cambia el modo del teclado y no puede usarse.",
        ["NumLock"] = "Bloq Num cambia el teclado numérico y no puede usarse.",
        ["Scroll"] = "Bloq Despl no puede usarse como atajo.",
        ["Snapshot"] = "Impr Pant está reservada para el sistema.",
        ["Sleep"] = "Esa tecla está reservada para el sistema.",
        ["ImeProcessed"] = "Esa tecla la usa el sistema de escritura y no puede asignarse.",
        ["DeadCharProcessed"] = "Las teclas de acento no pueden asignarse.",
    };

    private static readonly string[] SystemPrefixes = ["Browser", "Volume", "Media", "Launch"];

    private readonly Dictionary<string, string> fixedKeys;

    /// <param name="fixedKeys">Teclas no configurables (navegación) y su uso, por ejemplo Up → "mover la selección".</param>
    public KeyboardShortcutRules(IReadOnlyDictionary<string, string>? fixedKeys = null)
    {
        fixedKeys ??= new Dictionary<string, string>();
        this.fixedKeys = new Dictionary<string, string>(fixedKeys, StringComparer.OrdinalIgnoreCase);
    }

    public IReadOnlyDictionary<string, string> FixedKeys => fixedKeys;

    /// <summary>Teclas de navegación de <c>appsettings</c> que no forman parte de los atajos configurables.</summary>
    public static KeyboardShortcutRules FromInputOptions(OperationInputOptions? options)
    {
        var fixedKeys = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        InputControllerOptions? keyboard = options?.Controllers.FirstOrDefault(controller =>
            string.Equals(controller.AdapterKind, "KEYBOARD", StringComparison.OrdinalIgnoreCase));
        foreach ((string key, string specification) in keyboard?.Bindings ?? [])
        {
            if (!OperationInputActionParser.TryParse(specification, keyboard!.LineSlot, out OperationInputAction action, out _) ||
                KeyboardShortcutMap.IsConfigurable(action))
            {
                continue;
            }

            fixedKeys[key] = action == OperationInputAction.SelectLine
                ? "seleccionar la línea"
                : "mover la selección";
        }

        return new KeyboardShortcutRules(fixedKeys);
    }

    /// <summary>Indica si <paramref name="keyName"/> puede asignarse a <paramref name="action"/> dentro de <paramref name="map"/>.</summary>
    public KeyboardShortcutValidation Validate(KeyboardShortcutMap map, KeyboardShortcutAction action, string keyName)
    {
        ArgumentNullException.ThrowIfNull(map);
        if (string.IsNullOrWhiteSpace(keyName))
        {
            return new KeyboardShortcutValidation(false, ReservedKeys["None"]);
        }

        if (ReservedKeys.TryGetValue(keyName, out string? reserved))
        {
            return new KeyboardShortcutValidation(false, reserved);
        }

        if (SystemPrefixes.Any(prefix => keyName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)))
        {
            return new KeyboardShortcutValidation(false, "Las teclas multimedia están reservadas para el sistema.");
        }

        if (string.Equals(keyName, "Escape", StringComparison.OrdinalIgnoreCase) &&
            action != KeyboardShortcutAction.Cancel)
        {
            return new KeyboardShortcutValidation(false, "Esc solo puede usarse para cancelar o cerrar.");
        }

        if (fixedKeys.TryGetValue(keyName, out string? fixedUse))
        {
            return new KeyboardShortcutValidation(
                false,
                $"{KeyboardShortcutKeyNames.Describe(keyName)} ya se usa para {fixedUse}.");
        }

        if (map.TryFindAction(keyName, out KeyboardShortcutAction owner) && owner != action)
        {
            return new KeyboardShortcutValidation(
                false,
                $"{KeyboardShortcutKeyNames.Describe(keyName)} ya está asignada a «{KeyboardShortcutLabels.Label(owner)}». " +
                "Cambie primero esa acción.");
        }

        return new KeyboardShortcutValidation(true, string.Empty);
    }

    /// <summary>Un mapa completo es válido si toda acción tiene tecla, ninguna es reservada y no hay repetidas.</summary>
    public bool IsValid(KeyboardShortcutMap map)
    {
        ArgumentNullException.ThrowIfNull(map);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (KeyboardShortcutAction action in Enum.GetValues<KeyboardShortcutAction>())
        {
            IReadOnlyList<string> keys = map.KeysFor(action);
            if (keys.Count == 0) return false;
            foreach (string key in keys)
            {
                if (!seen.Add(key)) return false;
                if (!Validate(map, action, key).IsAllowed) return false;
            }
        }

        return true;
    }
}

public static class KeyboardShortcutLabels
{
    public static string Label(KeyboardShortcutAction action) => action switch
    {
        KeyboardShortcutAction.AddCajuela => "Agregar una cajuela",
        KeyboardShortcutAction.AddFiveCajuelas => "Agregar cinco cajuelas",
        KeyboardShortcutAction.SubtractCajuela => "Restar una cajuela",
        KeyboardShortcutAction.OpenSweep => "Abrir barrida",
        KeyboardShortcutAction.Confirm => "Confirmar acción",
        KeyboardShortcutAction.Cancel => "Cancelar o cerrar",
        _ => action.ToString(),
    };

    public static string Description(KeyboardShortcutAction action) => action switch
    {
        KeyboardShortcutAction.AddCajuela => "Suma una cajuela a la línea seleccionada.",
        KeyboardShortcutAction.AddFiveCajuelas => "Suma cinco cajuelas de una vez.",
        KeyboardShortcutAction.SubtractCajuela => "Prepara la corrección de la última cajuela; pide confirmación.",
        KeyboardShortcutAction.OpenSweep => "Prepara la barrida de la línea; requiere Jefe de Planta para confirmarla.",
        KeyboardShortcutAction.Confirm => "Confirma la corrección o barrida pendiente, o el botón seleccionado.",
        KeyboardShortcutAction.Cancel => "Cancela la corrección o barrida pendiente.",
        _ => string.Empty,
    };
}

public static class KeyboardShortcutKeyNames
{
    public static string Describe(string keyName) => keyName switch
    {
        "Add" => "+ (teclado numérico)",
        "OemPlus" => "+",
        "Subtract" => "− (teclado numérico)",
        "OemMinus" => "−",
        "Multiply" => "* (teclado numérico)",
        "Divide" => "/ (teclado numérico)",
        "Decimal" => ". (teclado numérico)",
        "Return" => "Enter",
        "Escape" => "Esc",
        "Space" => "Espacio",
        "Back" => "Retroceso",
        "Delete" => "Supr",
        "Insert" => "Insert",
        "Home" => "Inicio",
        "End" => "Fin",
        "Prior" => "Re Pág",
        "Next" => "Av Pág",
        "Up" => "Flecha arriba",
        "Down" => "Flecha abajo",
        "Left" => "Flecha izquierda",
        "Right" => "Flecha derecha",
        "OemComma" => ",",
        "OemPeriod" => ".",
        _ when keyName.Length == 2 && keyName[0] == 'D' && char.IsDigit(keyName[1]) => keyName[1..],
        _ when keyName.StartsWith("NumPad", StringComparison.Ordinal) && keyName.Length == 7 =>
            $"{keyName[6]} (teclado numérico)",
        _ => keyName,
    };

    public static string Describe(IEnumerable<string> keys) =>
        string.Join("  ·  ", keys.Select(Describe));
}
