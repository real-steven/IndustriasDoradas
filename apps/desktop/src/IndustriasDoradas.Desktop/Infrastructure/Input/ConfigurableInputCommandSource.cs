using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Infrastructure.Input;

public sealed class ConfigurableInputCommandSource : IInputCommandSource
{
    private const string KeyboardAdapterKind = "KEYBOARD";
    private readonly IReadOnlyDictionary<string, InputControllerOptions> controllers;
    private readonly TimeProvider timeProvider;
    private readonly IKeyboardShortcutSettings? shortcuts;

    public ConfigurableInputCommandSource(
        IOptions<OperationInputOptions> options,
        TimeProvider timeProvider)
        : this(options, timeProvider, null)
    {
    }

    /// <param name="shortcuts">
    /// Atajos locales del teclado. Si existen, mandan sobre las teclas de <c>appsettings</c> para
    /// las acciones configurables; la navegación (línea y flechas) sigue saliendo de <c>appsettings</c>.
    /// </param>
    public ConfigurableInputCommandSource(
        IOptions<OperationInputOptions> options,
        TimeProvider timeProvider,
        IKeyboardShortcutSettings? shortcuts)
    {
        this.timeProvider = timeProvider;
        this.shortcuts = shortcuts;
        controllers = options.Value.Controllers.ToDictionary(
            controller => controller.Id,
            StringComparer.OrdinalIgnoreCase);
        ControllerIds = controllers.Keys.Order(StringComparer.OrdinalIgnoreCase).ToArray();
    }

    public IReadOnlyCollection<string> ControllerIds { get; }

    public bool TryCreateForAdapter(
        string adapterKind,
        string signalCode,
        bool isRepeat,
        out OperationInputCommand? command)
    {
        InputControllerOptions? controller = controllers.Values.FirstOrDefault(
            candidate => string.Equals(
                candidate.AdapterKind,
                adapterKind,
                StringComparison.OrdinalIgnoreCase));
        return TryCreate(controller, signalCode, isRepeat, out command);
    }

    public bool TryCreateForController(
        string controllerId,
        string signalCode,
        bool isRepeat,
        out OperationInputCommand? command)
    {
        controllers.TryGetValue(controllerId, out InputControllerOptions? controller);
        return TryCreate(controller, signalCode, isRepeat, out command);
    }

    private bool TryCreate(
        InputControllerOptions? controller,
        string signalCode,
        bool isRepeat,
        out OperationInputCommand? command)
    {
        command = null;
        if (controller is null || string.IsNullOrWhiteSpace(signalCode))
        {
            return false;
        }

        OperationInputAction action;
        int lineSlot = controller.LineSlot;
        bool usesShortcuts = shortcuts is not null &&
            string.Equals(controller.AdapterKind, KeyboardAdapterKind, StringComparison.OrdinalIgnoreCase);
        if (usesShortcuts && shortcuts!.Current.TryFindAction(signalCode, out KeyboardShortcutAction shortcut))
        {
            action = KeyboardShortcutMap.ToInputAction(shortcut);
        }
        else if (!controller.Bindings.TryGetValue(signalCode, out string? specification) ||
                 !OperationInputActionParser.TryParse(
                     specification,
                     controller.LineSlot,
                     out action,
                     out lineSlot) ||
                 // Una tecla reasignada deja de ejecutar su acción anterior de appsettings.
                 usesShortcuts && KeyboardShortcutMap.IsConfigurable(action))
        {
            return false;
        }

        command = new OperationInputCommand(
            Guid.NewGuid(),
            action,
            new OperationInputOrigin(
                controller.AdapterKind.ToUpperInvariant(),
                controller.Id,
                signalCode,
                lineSlot,
                isRepeat),
            timeProvider.GetUtcNow());
        return true;
    }
}
