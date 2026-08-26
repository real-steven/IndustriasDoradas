using System.Windows.Input;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Infrastructure.Input;
using IndustriasDoradas.Desktop.Presentation.Input;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Tests.Presentation;

[TestClass]
public sealed class InputCommandSourceTests
{
    private static readonly DateTimeOffset Now = new(2026, 8, 26, 20, 0, 0, TimeSpan.Zero);

    [TestMethod]
    public void ConventionalKeyboardMapsEveryRequiredOperationCommand()
    {
        OperationInputOptions options = ValidOptions();
        Assert.IsTrue(options.IsValid());
        var source = new ConfigurableInputCommandSource(
            Options.Create(options),
            new FixedTimeProvider(Now));
        var adapter = new WpfKeyboardInputAdapter(source);
        adapter.Connect();
        (Key Key, OperationInputAction Action)[] expected =
        [
            (Key.D1, OperationInputAction.SelectLine),
            (Key.Add, OperationInputAction.RegisterCajuela),
            (Key.OemPlus, OperationInputAction.RegisterCajuela),
            (Key.Up, OperationInputAction.MoveUp),
            (Key.Down, OperationInputAction.MoveDown),
            (Key.Left, OperationInputAction.MoveLeft),
            (Key.Right, OperationInputAction.MoveRight),
            (Key.Enter, OperationInputAction.Confirm),
            (Key.R, OperationInputAction.RevertLastCajuela),
            (Key.Escape, OperationInputAction.Cancel),
        ];

        foreach ((Key key, OperationInputAction action) in expected)
        {
            Assert.IsTrue(
                adapter.TryTranslate(key, isRepeat: false, out OperationInputCommand? command),
                $"La tecla WPF {key} debe tener un mapeo configurado.");
            Assert.IsNotNull(command);
            Assert.AreEqual(action, command.Action);
            Assert.AreNotEqual(Guid.Empty, command.CommandId);
            Assert.AreEqual("KEYBOARD", command.Origin.SourceKind);
            Assert.AreEqual("shared-keyboard", command.Origin.ControllerId);
            Assert.AreEqual(1, command.Origin.LineSlot);
            Assert.IsFalse(command.Origin.IsRepeat);
            Assert.AreEqual(Now, command.OccurredAt);
        }
    }

    [TestMethod]
    public void KeyboardCanDisconnectAndReconnectWithoutReplacingTheInputPort()
    {
        var source = new ConfigurableInputCommandSource(
            Options.Create(ValidOptions()),
            new FixedTimeProvider(Now));
        var adapter = new WpfKeyboardInputAdapter(source);

        Assert.IsFalse(adapter.TryTranslate(Key.Add, false, out _));
        adapter.Connect();
        Assert.IsTrue(adapter.TryTranslate(Key.Add, false, out _));
        adapter.Disconnect();
        Assert.IsFalse(adapter.TryTranslate(Key.Add, false, out _));
        adapter.Connect();
        Assert.IsTrue(adapter.TryTranslate(Key.Add, true, out OperationInputCommand? repeated));
        Assert.IsTrue(repeated!.Origin.IsRepeat);
    }

    [TestMethod]
    public void ControllerSpecificMappingPreservesFutureLineAssignment()
    {
        OperationInputOptions options = ValidOptions();
        options.Controllers.Add(new InputControllerOptions
        {
            Id = "future-controller-2",
            AdapterKind = "HID",
            LineSlot = 2,
            Bindings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["BUTTON_1"] = "RegisterCajuela",
                ["BUTTON_2"] = "SelectLine:2",
            },
        });
        var source = new ConfigurableInputCommandSource(
            Options.Create(options),
            new FixedTimeProvider(Now));

        Assert.IsTrue(source.TryCreateForController(
            "future-controller-2",
            "BUTTON_1",
            false,
            out OperationInputCommand? command));
        Assert.AreEqual(OperationInputAction.RegisterCajuela, command!.Action);
        Assert.AreEqual("HID", command.Origin.SourceKind);
        Assert.AreEqual(2, command.Origin.LineSlot);
        Assert.IsFalse(source.TryCreateForController("missing", "BUTTON_1", false, out _));
    }

    [TestMethod]
    public void ConfigurationRejectsKeyboardWithoutARequiredAction()
    {
        OperationInputOptions options = ValidOptions();
        options.Controllers[0].Bindings.Remove("Escape");

        Assert.IsFalse(options.IsValid());
    }

    private static OperationInputOptions ValidOptions() =>
        new()
        {
            Controllers =
            [
                new InputControllerOptions
                {
                    Id = "shared-keyboard",
                    AdapterKind = "KEYBOARD",
                    LineSlot = 1,
                    Bindings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                    {
                        ["D1"] = "SelectLine:1",
                        ["Add"] = "RegisterCajuela",
                        ["OemPlus"] = "RegisterCajuela",
                        ["Up"] = "MoveUp",
                        ["Down"] = "MoveDown",
                        ["Left"] = "MoveLeft",
                        ["Right"] = "MoveRight",
                        ["Return"] = "Confirm",
                        ["R"] = "RevertLastCajuela",
                        ["Escape"] = "Cancel",
                    },
                },
            ],
        };

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
