using System.IO;
using System.Text;
using IndustriasDoradas.Desktop.Application.Abstractions;
using IndustriasDoradas.Desktop.Configuration;
using IndustriasDoradas.Desktop.Infrastructure.Audio;
using IndustriasDoradas.Desktop.Presentation.Feedback;
using IndustriasDoradas.Desktop.Presentation.ViewModels;
using Microsoft.Extensions.Options;

namespace IndustriasDoradas.Desktop.Tests.Infrastructure;

[TestClass]
public sealed class SoundPreferenceTests
{
    private string root = string.Empty;
    private string preferences = string.Empty;
    private string sources = string.Empty;

    [TestInitialize]
    public void CreateFolders()
    {
        root = Path.Combine(Path.GetTempPath(), "id-sound-tests", Guid.NewGuid().ToString("N"));
        preferences = Path.Combine(root, "preferences");
        sources = Path.Combine(root, "sources");
        Directory.CreateDirectory(sources);
    }

    [TestCleanup]
    public void DeleteFolders()
    {
        if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
    }

    [TestMethod]
    public void ValidatorAcceptsOnlyUncompressedPcmWave()
    {
        Assert.IsTrue(WaveFileValidator.IsPlayablePcmWave(SilentWave(), out _));
        Assert.IsFalse(WaveFileValidator.IsPlayablePcmWave(SilentWave(format: 0x55), out _), "MP3 dentro de WAV");
        Assert.IsFalse(WaveFileValidator.IsPlayablePcmWave(SilentWave(format: 3), out _), "WAV flotante");
        Assert.IsFalse(WaveFileValidator.IsPlayablePcmWave(Encoding.ASCII.GetBytes("ID3\u0003 not a wave file at all.........................."), out _));
        Assert.IsFalse(WaveFileValidator.IsPlayablePcmWave(SilentWave().AsSpan(0, 40), out _), "Encabezado truncado");
        Assert.IsFalse(WaveFileValidator.IsPlayablePcmWave(SilentWave(dataBytes: 0), out _), "Sin audio");
        Assert.IsTrue(WaveFileValidator.HasSupportedExtension("Alerta.WAV"));
        Assert.IsFalse(WaveFileValidator.HasSupportedExtension("alerta.mp3"));
    }

    [TestMethod]
    public void ImportedSoundPersistsAndSurvivesMovingTheOriginal()
    {
        string original = WriteSource("campana.wav", SilentWave());
        var store = new SoundPreferenceStore(preferences);

        SoundImportResult result = store.Import(FeedbackSoundEvent.CajuelaAdded, original);
        File.Move(original, Path.Combine(sources, "movida.wav"));

        Assert.IsTrue(result.Succeeded, result.Message);
        SoundPreferences reloaded = new SoundPreferenceStore(preferences).Load();
        SoundAssignment assignment = reloaded.Assignments[FeedbackSoundEvent.CajuelaAdded];
        Assert.AreEqual("campana.wav", assignment.OriginalFileName);
        Assert.IsNotNull(store.ReadCustomSound(assignment), "La copia administrada no depende del original.");
        Assert.IsTrue(reloaded.Enabled);
    }

    [TestMethod]
    public void ReplacingAndRestoringRemovesManagedCopies()
    {
        var store = new SoundPreferenceStore(preferences);
        store.Import(FeedbackSoundEvent.SweepRegistered, WriteSource("uno.wav", SilentWave()));
        store.Import(FeedbackSoundEvent.SweepRegistered, WriteSource("dos.wav", SilentWave()));

        Assert.AreEqual(1, Directory.GetFiles(Path.Combine(preferences, "files")).Length);
        Assert.AreEqual("dos.wav", store.Load().Assignments[FeedbackSoundEvent.SweepRegistered].OriginalFileName);

        store.Restore(FeedbackSoundEvent.SweepRegistered);

        Assert.IsFalse(store.Load().Assignments.ContainsKey(FeedbackSoundEvent.SweepRegistered));
        Assert.AreEqual(0, Directory.GetFiles(Path.Combine(preferences, "files")).Length);
    }

    [TestMethod]
    public void UnsupportedFilesAreRejectedWithoutChangingTheConfiguration()
    {
        var store = new SoundPreferenceStore(preferences);

        Assert.IsFalse(store.Import(FeedbackSoundEvent.ErrorOrRejected, WriteSource("tono.mp3", SilentWave())).Succeeded);
        Assert.IsFalse(store.Import(FeedbackSoundEvent.ErrorOrRejected, WriteSource("falso.wav", [1, 2, 3, 4])).Succeeded);
        Assert.IsFalse(store.Import(FeedbackSoundEvent.ErrorOrRejected, Path.Combine(sources, "no-existe.wav")).Succeeded);
        Assert.IsFalse(store.Import(
            FeedbackSoundEvent.ErrorOrRejected,
            WriteSource("enorme.wav", SilentWave(dataBytes: (int)WaveFileValidator.MaxFileBytes))).Succeeded);

        Assert.AreEqual(0, store.Load().Assignments.Count);
        Assert.IsFalse(File.Exists(Path.Combine(preferences, "settings.json")));
    }

    [TestMethod]
    public void MissingOrCorruptSettingsFallBackToDefaults()
    {
        Assert.AreEqual(SoundPreferences.Default, new SoundPreferenceStore(preferences).Load());

        Directory.CreateDirectory(preferences);
        File.WriteAllText(Path.Combine(preferences, "settings.json"), "{ esto no es json");
        SoundPreferences corrupt = new SoundPreferenceStore(preferences).Load();
        Assert.IsTrue(corrupt.Enabled);
        Assert.AreEqual(0, corrupt.Assignments.Count);

        File.WriteAllBytes(Path.Combine(preferences, "settings.json"), [0x00, 0xFF, 0x13]);
        Assert.AreEqual(0, new SoundPreferenceStore(preferences).Load().Assignments.Count);
    }

    [TestMethod]
    public void InjectedPathsInSettingsAreNeverRead()
    {
        string outside = WriteSource("fuera.wav", SilentWave());
        Directory.CreateDirectory(preferences);
        File.WriteAllText(
            Path.Combine(preferences, "settings.json"),
            System.Text.Json.JsonSerializer.Serialize(new
            {
                Version = 1,
                Enabled = true,
                Assignments = new { CajuelaAdded = new { File = outside, OriginalName = "x.wav" } },
            }));
        var store = new SoundPreferenceStore(preferences);

        SoundAssignment assignment = store.Load().Assignments[FeedbackSoundEvent.CajuelaAdded];

        Assert.IsNull(store.ReadCustomSound(assignment), "Solo se leen archivos de la carpeta administrada.");
    }

    [TestMethod]
    public void DisablingPersistsAndSilencesEveryAction()
    {
        var played = new List<FeedbackSoundEvent>();
        var store = new SoundPreferenceStore(preferences);
        store.Import(FeedbackSoundEvent.CajuelaAdded, WriteSource("campana.wav", SilentWave()));
        WpfOperationFeedbackPlayer player = CreatePlayer(store, played);

        player.SetEnabled(false);
        player.Play(OperationFeedbackKind.Success, FeedbackSoundEvent.CajuelaAdded);
        player.Play(OperationFeedbackKind.Error);
        player.PlayReviewAlert();

        Assert.IsFalse(new SoundPreferenceStore(preferences).Load().Enabled);
        Assert.AreEqual(0, played.Count);
        Assert.IsNull(player.LastPlayedState);
        Assert.IsFalse(CreatePlayer(new SoundPreferenceStore(preferences), played).IsEnabled, "Persiste al reiniciar.");
    }

    [TestMethod]
    public void PreviewPlaysEvenWhenSoundsAreDisabled()
    {
        var played = new List<FeedbackSoundEvent>();
        WpfOperationFeedbackPlayer player = CreatePlayer(new SoundPreferenceStore(preferences), played);
        player.SetEnabled(false);

        player.Preview(FeedbackSoundEvent.ErrorOrRejected);

        CollectionAssert.AreEqual(new[] { FeedbackSoundEvent.ErrorOrRejected }, played);
    }

    [TestMethod]
    public void StationPolicyDisablesSoundsRegardlessOfLocalPreference()
    {
        var played = new List<FeedbackSoundEvent>();
        var player = new WpfOperationFeedbackPlayer(
            Options.Create(new OperationSafetyOptions { SoundFeedbackEnabled = false }),
            new SoundPreferenceStore(preferences),
            played.Add,
            loadInBackground: false);

        player.Play(OperationFeedbackKind.Error);

        Assert.IsFalse(player.IsAllowedByStation);
        Assert.AreEqual(0, played.Count);
    }

    [TestMethod]
    public void MissingManagedFileFallsBackToTheDefaultSound()
    {
        var store = new SoundPreferenceStore(preferences);
        store.Import(FeedbackSoundEvent.SweepRegistered, WriteSource("barrida.wav", SilentWave()));
        foreach (string file in Directory.GetFiles(Path.Combine(preferences, "files"))) File.Delete(file);
        var played = new List<FeedbackSoundEvent>();

        WpfOperationFeedbackPlayer player = CreatePlayer(new SoundPreferenceStore(preferences), played);
        player.Play(OperationFeedbackKind.Success, FeedbackSoundEvent.SweepRegistered);

        CollectionAssert.AreEqual(new[] { FeedbackSoundEvent.SweepRegistered }, played);
        Assert.AreEqual(SoundAssignmentState.FallbackToDefault, player.LastPlayedState);
        Assert.AreEqual(SoundAssignmentState.FallbackToDefault, player.Describe(FeedbackSoundEvent.SweepRegistered).State);
    }

    [TestMethod]
    public void DamagedManagedFileFallsBackToTheDefaultSound()
    {
        var store = new SoundPreferenceStore(preferences);
        store.Import(FeedbackSoundEvent.CajuelaSubtracted, WriteSource("resta.wav", SilentWave()));
        string managed = Directory.GetFiles(Path.Combine(preferences, "files")).Single();
        File.WriteAllBytes(managed, [0x52, 0x49, 0x46, 0x46, 0x00]);
        var played = new List<FeedbackSoundEvent>();

        WpfOperationFeedbackPlayer player = CreatePlayer(new SoundPreferenceStore(preferences), played);
        player.Play(OperationFeedbackKind.Success, FeedbackSoundEvent.CajuelaSubtracted);

        CollectionAssert.AreEqual(new[] { FeedbackSoundEvent.CajuelaSubtracted }, played);
        Assert.AreEqual(SoundAssignmentState.FallbackToDefault, player.LastPlayedState);
    }

    [TestMethod]
    public void CustomSoundIsUsedInsteadOfTheDefault()
    {
        var store = new SoundPreferenceStore(preferences);
        store.Import(FeedbackSoundEvent.CajuelaAdded, WriteSource("campana.wav", SilentWave()));
        var played = new List<FeedbackSoundEvent>();

        WpfOperationFeedbackPlayer player = CreatePlayer(store, played);
        player.Play(OperationFeedbackKind.Success, FeedbackSoundEvent.CajuelaAdded);

        Assert.AreEqual(0, played.Count, "No suena el predeterminado.");
        Assert.AreEqual(SoundAssignmentState.Custom, player.LastPlayedState);
    }

    [TestMethod]
    public void GenericKindsMapToTheirActions()
    {
        var played = new List<FeedbackSoundEvent>();
        WpfOperationFeedbackPlayer player = CreatePlayer(new SoundPreferenceStore(preferences), played);

        player.Play(OperationFeedbackKind.Success);
        player.Play(OperationFeedbackKind.Error);
        player.Play(OperationFeedbackKind.Warning);
        player.Play(OperationFeedbackKind.Neutral);
        player.PlayReviewAlert();

        CollectionAssert.AreEqual(
            new[]
            {
                FeedbackSoundEvent.OperationSucceeded,
                FeedbackSoundEvent.ErrorOrRejected,
                FeedbackSoundEvent.MercuryReviewAlert,
            },
            played);
    }

    [TestMethod]
    public void StationsUseIndependentLocalFolders()
    {
        Guid first = Guid.NewGuid();
        Guid second = Guid.NewGuid();
        string localData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

        string firstDirectory = SoundPreferenceStore.DefaultDirectory(first);

        Assert.AreNotEqual(firstDirectory, SoundPreferenceStore.DefaultDirectory(second));
        Assert.IsTrue(firstDirectory.StartsWith(localData, StringComparison.OrdinalIgnoreCase));
        Assert.IsFalse(firstDirectory.Contains("stations", StringComparison.OrdinalIgnoreCase),
            "No se mezcla con la base SQLite ni sus respaldos.");
    }

    [TestMethod]
    public void DialogViewModelChoosesPreviewsAndRestores()
    {
        string original = WriteSource("aviso.wav", SilentWave());
        var played = new List<FeedbackSoundEvent>();
        WpfOperationFeedbackPlayer player = CreatePlayer(new SoundPreferenceStore(preferences), played);
        var picker = new FakePicker(original);
        var dialog = new SoundSettingsViewModel(player, picker);
        SoundActionItemViewModel row = dialog.Actions.Single(item => item.Sound == FeedbackSoundEvent.ErrorOrRejected);

        Assert.AreEqual(7, dialog.Actions.Count);
        Assert.IsFalse(row.RestoreCommand.CanExecute(null));
        StringAssert.Contains(row.AssignedName, "predeterminado");

        row.ChooseCommand.Execute(null);
        Assert.AreEqual("aviso.wav", row.AssignedName);
        Assert.IsTrue(row.RestoreCommand.CanExecute(null));

        row.PreviewCommand.Execute(null);
        Assert.AreEqual(SoundAssignmentState.Custom, player.LastPlayedState);

        row.RestoreCommand.Execute(null);
        StringAssert.Contains(row.AssignedName, "predeterminado");
        Assert.IsFalse(row.RestoreCommand.CanExecute(null));

        dialog.IsEnabled = false;
        StringAssert.Contains(dialog.Status, "respuesta visual");
        Assert.IsFalse(new SoundPreferenceStore(preferences).Load().Enabled);
    }

    [TestMethod]
    public void DialogShowsAReasonForInvalidFilesAndKeepsTheDefault()
    {
        var player = CreatePlayer(new SoundPreferenceStore(preferences), []);
        var dialog = new SoundSettingsViewModel(player, new FakePicker(WriteSource("roto.wav", [9, 9, 9])));
        SoundActionItemViewModel row = dialog.Actions.First();

        row.ChooseCommand.Execute(null);

        StringAssert.Contains(dialog.Status, "WAV");
        StringAssert.Contains(row.AssignedName, "predeterminado");
    }

    private static WpfOperationFeedbackPlayer CreatePlayer(SoundPreferenceStore store, List<FeedbackSoundEvent> played) =>
        new(Options.Create(new OperationSafetyOptions()), store, played.Add, loadInBackground: false);

    private string WriteSource(string name, byte[] bytes)
    {
        string path = Path.Combine(sources, name);
        File.WriteAllBytes(path, bytes);
        return path;
    }

    private static byte[] SilentWave(ushort format = 1, int dataBytes = 2_000)
    {
        const int sampleRate = 22_050;
        using var stream = new MemoryStream();
        using var writer = new BinaryWriter(stream, Encoding.ASCII);
        writer.Write(Encoding.ASCII.GetBytes("RIFF"));
        writer.Write(36 + dataBytes);
        writer.Write(Encoding.ASCII.GetBytes("WAVEfmt "));
        writer.Write(16);
        writer.Write(format);
        writer.Write((short)1);
        writer.Write(sampleRate);
        writer.Write(sampleRate * 2);
        writer.Write((short)2);
        writer.Write((short)16);
        writer.Write(Encoding.ASCII.GetBytes("data"));
        writer.Write(dataBytes);
        writer.Write(new byte[dataBytes]);
        writer.Flush();
        return stream.ToArray();
    }

    private sealed class FakePicker(string? path) : ISoundFilePicker
    {
        public string? PickWaveFile() => path;
    }
}
