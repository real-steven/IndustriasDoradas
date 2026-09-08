using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Infrastructure.Input;

public sealed class ConfigurableInputCommandSource : IInputCommandSource
{
    private readonly IReadOnlyDictionary<string, InputControllerOptions> controllers;
    private readonly TimeProvider timeProvider;

    public ConfigurableInputCommandSource(
        IOptions<OperationInputOptions> options,
        TimeProvider timeProvider)
    {
        this.timeProvider = timeProvider;
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
        if (controller is null ||
            string.IsNullOrWhiteSpace(signalCode) ||
            !controller.Bindings.TryGetValue(signalCode, out string? specification) ||
            !OperationInputActionParser.TryParse(
                specification,
                controller.LineSlot,
                out OperationInputAction action,
                out int lineSlot))
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
