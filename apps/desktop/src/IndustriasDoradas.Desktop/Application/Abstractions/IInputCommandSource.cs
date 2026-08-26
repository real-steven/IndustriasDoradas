using IndustriasDoradas.Desktop.Application;

namespace IndustriasDoradas.Desktop.Application.Abstractions;

public interface IInputCommandSource
{
    IReadOnlyCollection<string> ControllerIds { get; }

    bool TryCreateForAdapter(
        string adapterKind,
        string signalCode,
        bool isRepeat,
        out OperationInputCommand? command);

    bool TryCreateForController(
        string controllerId,
        string signalCode,
        bool isRepeat,
        out OperationInputCommand? command);
}
