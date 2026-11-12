using System.IO;
using IndustriasDoradas.Desktop.Application;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Infrastructure.Input;

namespace IndustriasDoradas.Desktop.Tests.Infrastructure;

[TestClass]
public sealed class KeyboardShortcutPreferenceTests
{
    private string directory = string.Empty;

    [TestInitialize]
    public void CreateDirectory()
    {
        directory = Path.Combine(Path.GetTempPath(), "id-shortcut-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
    }

    [TestCleanup]
    public void DeleteDirectory()
    {
        if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
    }

    private string SettingsPath => Path.Combine(directory, KeyboardShortcutPreferenceStore.FileName);

    [TestMethod]
    public void MissingFileUsesSafeDefaults()
    {
        var store = new KeyboardShortcutPreferenceStore(directory);

        Assert.IsTrue(store.Current.HasSameBindings(KeyboardShortcutMap.Default));
        Assert.IsTrue(store.Rules.IsValid(store.Current));
        Assert.IsFalse(File.Exists(SettingsPath), "Leer no debe crear archivos.");
    }

    [TestMethod]
    public void SavedShortcutsSurviveRestartAndOnlyTouchTheLocalJson()
    {
        var store = new KeyboardShortcutPreferenceStore(directory);
        KeyboardShortcutMap changed = store.Current.With(KeyboardShortcutAction.OpenSweep, "F2");

        Assert.IsTrue(store.Save(changed));
        Assert.AreEqual("F2", store.Current.KeysFor(KeyboardShortcutAction.OpenSweep).Single());

        var restarted = new KeyboardShortcutPreferenceStore(directory);
        Assert.AreEqual("F2", restarted.Current.KeysFor(KeyboardShortcutAction.OpenSweep).Single());
        CollectionAssert.AreEquivalent(
            new[] { KeyboardShortcutPreferenceStore.FileName },
            Directory.GetFiles(directory).Select(Path.GetFileName).ToArray(),
            "La escritura atómica no deja temporales y no se crea SQLite ni Outbox.");
    }

    [TestMethod]
    public void KeyAliasesAreStoredWithTheNameTheKeyboardSends()
    {
        var store = new KeyboardShortcutPreferenceStore(directory);

        Assert.IsTrue(store.Save(store.Current.With(KeyboardShortcutAction.OpenSweep, "PageDown")));

        Assert.AreEqual("Next", store.Current.KeysFor(KeyboardShortcutAction.OpenSweep).Single());
    }

    [TestMethod]
    [DataRow("{ esto no es json")]
    [DataRow("null")]
    [DataRow("""{ "Version": 1, "Bindings": { "AddCajuela": ["NoEsUnaTecla"] } }""")]
    [DataRow("""{ "Version": 1, "Bindings": { "AddCajuela": ["B"], "OpenSweep": ["B"] } }""")]
    [DataRow("""{ "Version": 1, "Bindings": { "AddCajuela": ["Tab"] } }""")]
    [DataRow("""{ "Version": 1, "Bindings": { "Confirm": ["Escape"], "Cancel": ["C"] } }""")]
    [DataRow("""{ "Version": 1, "Bindings": { "AccionDesconocida": ["F2"] } }""")]
    [DataRow("""{ "Version": 1, "Bindings": { "AddCajuela": [] } }""")]
    public void CorruptOrUnsafeFileFallsBackToDefaultsWithoutThrowing(string content)
    {
        File.WriteAllText(SettingsPath, content);

        var store = new KeyboardShortcutPreferenceStore(directory);

        Assert.IsTrue(store.Current.HasSameBindings(KeyboardShortcutMap.Default));
    }

    [TestMethod]
    public void FileWithoutNewActionKeepsCustomKeysAndAddsDefaultForTheMissingOne()
    {
        File.WriteAllText(SettingsPath, """{ "Version": 1, "Bindings": { "OpenSweep": ["F2"] } }""");

        var store = new KeyboardShortcutPreferenceStore(directory);

        Assert.AreEqual("F2", store.Current.KeysFor(KeyboardShortcutAction.OpenSweep).Single());
        CollectionAssert.AreEqual(
            KeyboardShortcutMap.Default.KeysFor(KeyboardShortcutAction.AddCajuela).ToArray(),
            store.Current.KeysFor(KeyboardShortcutAction.AddCajuela).ToArray());
    }

    [TestMethod]
    public void SaveRejectsCollisionsAndKeepsPreviousShortcuts()
    {
        var store = new KeyboardShortcutPreferenceStore(directory);
        var colliding = new KeyboardShortcutMap(new Dictionary<KeyboardShortcutAction, IReadOnlyList<string>>(
            KeyboardShortcutMap.Default.Bindings)
        {
            [KeyboardShortcutAction.OpenSweep] = ["Add"],
        });

        Assert.IsFalse(store.Save(colliding));
        Assert.IsTrue(store.Current.HasSameBindings(KeyboardShortcutMap.Default));
        Assert.IsFalse(File.Exists(SettingsPath));
    }

    [TestMethod]
    public void UnwritableDirectoryReportsFailureWithoutClosingTheApp()
    {
        string blocker = Path.Combine(directory, "archivo");
        File.WriteAllText(blocker, "no es carpeta");
        var store = new KeyboardShortcutPreferenceStore(Path.Combine(blocker, "keyboard"));

        Assert.IsFalse(store.Save(store.Current.With(KeyboardShortcutAction.OpenSweep, "F2")));
        Assert.IsTrue(store.Current.HasSameBindings(KeyboardShortcutMap.Default));
    }

    [TestMethod]
    public void DefaultDirectoryIsPerStationUnderLocalAppData()
    {
        Guid station = Guid.Parse("34000000-0000-4000-8000-000000000001");
        string path = KeyboardShortcutPreferenceStore.DefaultDirectory(station);

        StringAssert.StartsWith(path, Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData));
        StringAssert.Contains(path, Path.Combine("IndustriasDoradas", "preferences", "keyboard"));
        StringAssert.EndsWith(path, station.ToString("N"));
    }

    [TestMethod]
    public void RulesBlockCollisionsAndReservedKeys()
    {
        var rules = new KeyboardShortcutRules();
        KeyboardShortcutMap map = KeyboardShortcutMap.Default;

        Assert.IsTrue(rules.Validate(map, KeyboardShortcutAction.OpenSweep, "F2").IsAllowed);
        Assert.IsTrue(rules.Validate(map, KeyboardShortcutAction.AddCajuela, "Add").IsAllowed,
            "Volver a elegir la misma tecla de la acción no es una colisión.");

        KeyboardShortcutValidation collision = rules.Validate(map, KeyboardShortcutAction.OpenSweep, "Add");
        Assert.IsFalse(collision.IsAllowed);
        StringAssert.Contains(collision.Message, "Agregar una cajuela");

        foreach (string reserved in new[] { "Tab", "System", "LWin", "RWin", "F11", "LeftCtrl", "Capital", "VolumeUp", "None" })
        {
            Assert.IsFalse(rules.Validate(map, KeyboardShortcutAction.OpenSweep, reserved).IsAllowed, reserved);
        }

        Assert.IsFalse(rules.Validate(map, KeyboardShortcutAction.Confirm, "Escape").IsAllowed,
            "Esc solo puede cancelar o cerrar.");
        Assert.IsTrue(rules.Validate(map, KeyboardShortcutAction.Cancel, "Escape").IsAllowed);
    }

    [TestMethod]
    public void RulesProtectNavigationKeysFromAppSettings()
    {
        var options = new OperationInputOptions
        {
            Controllers =
            [
                new InputControllerOptions
                {
                    Id = "shared-keyboard",
                    AdapterKind = "KEYBOARD",
                    Bindings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                    {
                        ["D1"] = "SelectLine:1",
                        ["Up"] = "MoveUp",
                        ["R"] = "RevertLastCajuela",
                    },
                },
            ],
        };

        KeyboardShortcutRules rules = KeyboardShortcutRules.FromInputOptions(options);

        Assert.IsFalse(rules.Validate(KeyboardShortcutMap.Default, KeyboardShortcutAction.OpenSweep, "Up").IsAllowed);
        Assert.IsFalse(rules.Validate(KeyboardShortcutMap.Default, KeyboardShortcutAction.OpenSweep, "D1").IsAllowed);
        Assert.IsTrue(rules.Validate(KeyboardShortcutMap.Default, KeyboardShortcutAction.OpenSweep, "R").IsAllowed,
            "La tecla antigua de restar queda libre porque esa acción ya es configurable.");
    }
}
