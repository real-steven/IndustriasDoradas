using System.IO;
using System.Text;
using IndustriasDoradas.Desktop.Infrastructure.LocalStorage;

namespace IndustriasDoradas.Desktop.Tests.Infrastructure;

[TestClass]
public sealed class RecentEmailPreferenceStoreTests
{
    private string directory = string.Empty;

    [TestInitialize]
    public void CreateDirectory()
    {
        directory = Path.Combine(Path.GetTempPath(), "id-email-pref-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
    }

    [TestCleanup]
    public void DeleteDirectory()
    {
        if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
    }

    [TestMethod]
    public void MissingFileMeansNoRememberedEmail()
    {
        var store = new RecentEmailPreferenceStore(PathFor("no-existe.txt"));

        Assert.IsNull(store.Load());
        store.Forget();
        Assert.IsFalse(File.Exists(store.FilePath));
    }

    [TestMethod]
    public void RememberedEmailSurvivesANewInstanceAndCreatesTheFolder()
    {
        string path = Path.Combine(directory, "carpeta", "nueva", RecentEmailPreferenceStore.FileName);

        Assert.IsTrue(new RecentEmailPreferenceStore(path).Remember("  jefe@planta.test  "));

        Assert.AreEqual("jefe@planta.test", new RecentEmailPreferenceStore(path).Load());
        Assert.AreEqual("jefe@planta.test", File.ReadAllText(path), "El archivo solo contiene el correo.");
        Assert.IsFalse(File.Exists(path + ".tmp"));
    }

    [TestMethod]
    public void ForgetRemovesTheEmail()
    {
        var store = new RecentEmailPreferenceStore(PathFor(RecentEmailPreferenceStore.FileName));
        store.Remember("jefe@planta.test");

        store.Forget();

        Assert.IsFalse(File.Exists(store.FilePath));
        Assert.IsNull(new RecentEmailPreferenceStore(store.FilePath).Load());
    }

    [TestMethod]
    [DataRow("")]
    [DataRow("   ")]
    [DataRow("sin-arroba")]
    [DataRow("@planta.test")]
    [DataRow("jefe@")]
    [DataRow("jefe@planta.test\nclave-secreta")]
    [DataRow("jefe @planta.test")]
    [DataRow("a@b@c.test")]
    public void CorruptOrUnexpectedContentIsIgnored(string content)
    {
        string path = PathFor(RecentEmailPreferenceStore.FileName);
        File.WriteAllText(path, content);

        Assert.IsNull(new RecentEmailPreferenceStore(path).Load());
    }

    [TestMethod]
    public void BinaryOrOversizedFilesAreIgnoredAndCanBeReplaced()
    {
        string path = PathFor(RecentEmailPreferenceStore.FileName);
        File.WriteAllBytes(path, [0x00, 0xFF, 0xFE, 0x40, 0x0A, 0x1B]);
        var store = new RecentEmailPreferenceStore(path);
        Assert.IsNull(store.Load());

        File.WriteAllText(path, new string('a', 2_000) + "@planta.test");
        Assert.IsNull(store.Load());

        Assert.IsTrue(store.Remember("jefe@planta.test"));
        Assert.AreEqual("jefe@planta.test", store.Load());
    }

    [TestMethod]
    public void Utf8WithByteOrderMarkIsAccepted()
    {
        string path = PathFor(RecentEmailPreferenceStore.FileName);
        File.WriteAllText(path, "jefe@planta.test", new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));

        Assert.AreEqual("jefe@planta.test", new RecentEmailPreferenceStore(path).Load());
    }

    [TestMethod]
    [DataRow("")]
    [DataRow("contraseña-sin-correo")]
    [DataRow("jefe@planta.test 123456")]
    public void OnlyAnEmailCanBeStored(string value)
    {
        var store = new RecentEmailPreferenceStore(PathFor(RecentEmailPreferenceStore.FileName));

        Assert.IsFalse(store.Remember(value));
        Assert.IsFalse(File.Exists(store.FilePath));
    }

    [TestMethod]
    public void UnwritableLocationDoesNotThrow()
    {
        // Una carpeta con el nombre del archivo hace imposible escribirlo o leerlo.
        string path = PathFor(RecentEmailPreferenceStore.FileName);
        Directory.CreateDirectory(path);
        var store = new RecentEmailPreferenceStore(path);

        Assert.IsFalse(store.Remember("jefe@planta.test"));
        Assert.IsNull(store.Load());
        store.Forget();
        Assert.IsTrue(Directory.Exists(path));
    }

    [TestMethod]
    public void IndependentLocalPathsDoNotShareTheEmail()
    {
        // Equivale a dos usuarios de Windows: cada uno tiene su propia LocalApplicationData.
        var firstUser = new RecentEmailPreferenceStore(Path.Combine(directory, "usuario-a", RecentEmailPreferenceStore.FileName));
        var secondUser = new RecentEmailPreferenceStore(Path.Combine(directory, "usuario-b", RecentEmailPreferenceStore.FileName));

        firstUser.Remember("jefe-a@planta.test");
        Assert.IsNull(secondUser.Load());

        secondUser.Remember("jefe-b@planta.test");
        firstUser.Forget();

        Assert.IsNull(firstUser.Load());
        Assert.AreEqual("jefe-b@planta.test", secondUser.Load());
    }

    [TestMethod]
    public void DefaultLocationIsLocalToThisWindowsUserAndNotRoaming()
    {
        string localData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string roamingData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        string path = new RecentEmailPreferenceStore().FilePath;

        Assert.AreEqual(
            Path.Combine(localData, "IndustriasDoradas", "recent-email.txt"),
            path,
            "Debe conservar la ruta de versiones anteriores para no perder la preferencia.");
        Assert.IsFalse(path.StartsWith(roamingData + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase));
    }

    private string PathFor(string fileName) => Path.Combine(directory, fileName);
}
