using IndustriasDoradas.Desktop.Application.Profile;
using IndustriasDoradas.Desktop.Presentation.ViewModels;

namespace IndustriasDoradas.Desktop.Tests.Presentation;

[TestClass]
public sealed class ProfilePopoverViewModelTests
{
    private static readonly Guid ProfileId = Guid.Parse("a1000000-0000-4000-8000-000000000002");
    private static readonly string[] ServiceMethods = ["LoadAsync", "SavePhoneAsync"];
    private static readonly string[] ApiMethods = ["GetSelfProfileAsync", "UpdatePhoneAsync"];

    [TestMethod]
    public async Task WithoutElevationItIsReadOnlyAndNeverStartsElevation()
    {
        var harness = new Harness(elevated: false);
        await harness.ViewModel.OpenAsync();

        Assert.AreEqual("Jefe Ficticio", harness.ViewModel.DisplayName);
        Assert.AreEqual("JF", harness.ViewModel.Initials);
        Assert.AreEqual("jefe@planta.test", harness.ViewModel.Email);
        Assert.AreEqual("+506 8888 7777", harness.ViewModel.PhoneText);
        Assert.AreEqual("Acceso operativo", harness.ViewModel.AccessStateText);
        Assert.IsTrue(harness.ViewModel.IsReadOnly);
        Assert.IsFalse(harness.ViewModel.BeginEditPhoneCommand.CanExecute(null));
        Assert.IsFalse(harness.ViewModel.ChangePhotoCommand.CanExecute(null));
        Assert.IsFalse(harness.ViewModel.RemovePhotoCommand.CanExecute(null));

        await harness.ViewModel.SavePhoneAsync("123456");
        Assert.AreEqual(0, harness.Service.SaveCalls);
        Assert.AreEqual(ProfilePopoverViewModel.ReadOnlyHintText, harness.ViewModel.StatusMessage);
        Assert.AreEqual(0, harness.PickerCalls, "Sin elevación no se abre el selector de archivos.");
    }

    [TestMethod]
    public void NameAndEmailCannotBeEditedFromTheStation()
    {
        Type type = typeof(ProfilePopoverViewModel);
        Assert.IsFalse(type.GetProperty(nameof(ProfilePopoverViewModel.DisplayName))!.SetMethod!.IsPublic);
        Assert.IsFalse(type.GetProperty(nameof(ProfilePopoverViewModel.Email))!.SetMethod!.IsPublic);
        string[] serviceMethods = typeof(IProfileContactService).GetMethods().Select(method => method.Name).ToArray();
        CollectionAssert.AreEquivalent(ServiceMethods, serviceMethods);
        string[] apiMethods = typeof(IProfileApi).GetMethods().Select(method => method.Name).ToArray();
        CollectionAssert.AreEquivalent(ApiMethods, apiMethods);
    }

    [TestMethod]
    public async Task ElevatedManagerChangesThePhoneThroughTheServiceWithPin()
    {
        var harness = new Harness(elevated: true);
        await harness.ViewModel.OpenAsync();
        Assert.AreEqual("Modo Jefe de Planta activo", harness.ViewModel.AccessStateText);

        harness.ViewModel.BeginEditPhoneCommand.Execute(null);
        harness.ViewModel.PhoneDraft = "+1 415 555 0100";
        await harness.ViewModel.SavePhoneAsync("123456");

        Assert.AreEqual(1, harness.Service.SaveCalls);
        Assert.AreEqual("+1 415 555 0100", harness.Service.LastPhone);
        Assert.AreEqual("123456", harness.Service.LastPin);
        Assert.AreEqual("+14155550100", harness.ViewModel.PhoneText);
        Assert.IsFalse(harness.ViewModel.IsEditingPhone);
        Assert.IsFalse(harness.ViewModel.StatusIsError);
        Assert.IsTrue(harness.PinResets > 0, "El PIN se borra de la vista después de usarlo.");
    }

    [TestMethod]
    public async Task EmptyPhoneIsAllowedAndInvalidPhoneIsRejectedLocally()
    {
        var harness = new Harness(elevated: true);
        await harness.ViewModel.OpenAsync();
        harness.ViewModel.BeginEditPhoneCommand.Execute(null);

        harness.ViewModel.PhoneDraft = "123";
        await harness.ViewModel.SavePhoneAsync("123456");
        Assert.AreEqual(0, harness.Service.SaveCalls);
        Assert.IsTrue(harness.ViewModel.StatusIsError);

        harness.ViewModel.PhoneDraft = "";
        await harness.ViewModel.SavePhoneAsync("123456");
        Assert.AreEqual(1, harness.Service.SaveCalls);
        Assert.AreEqual("No registrado", harness.ViewModel.PhoneText);
    }

    [TestMethod]
    public async Task ExpiredElevationCancelsUnsavedEditsAndBlocksSaving()
    {
        var harness = new Harness(elevated: true);
        await harness.ViewModel.OpenAsync();
        harness.ViewModel.BeginEditPhoneCommand.Execute(null);
        harness.ViewModel.PhoneDraft = "7123-4567";

        harness.Elevated = false;
        harness.ViewModel.OnElevationChanged();

        Assert.IsFalse(harness.ViewModel.IsEditingPhone);
        Assert.AreEqual(string.Empty, harness.ViewModel.PhoneDraft);
        Assert.IsTrue(harness.ViewModel.IsReadOnly);
        Assert.AreEqual("Acceso operativo", harness.ViewModel.AccessStateText);
        Assert.IsTrue(harness.ViewModel.StatusIsError);

        await harness.ViewModel.SavePhoneAsync("123456");
        Assert.AreEqual(0, harness.Service.SaveCalls);
        Assert.IsFalse(harness.ViewModel.ChangePhotoCommand.CanExecute(null));
    }

    [TestMethod]
    public async Task OfflineShowsLastKnownDataAndExplainsThatSavingNeedsConnection()
    {
        var harness = new Harness(elevated: true) { };
        harness.Service.Offline = true;
        harness.Service.SaveResult = new PhoneUpdateResult(PhoneUpdateStatus.ConnectionRequired);
        await harness.ViewModel.OpenAsync();
        Assert.IsTrue(harness.ViewModel.IsOfflineData);

        harness.ViewModel.BeginEditPhoneCommand.Execute(null);
        harness.ViewModel.PhoneDraft = "8888-1111";
        await harness.ViewModel.SavePhoneAsync("123456");

        StringAssert.Contains(harness.ViewModel.StatusMessage, "conexión a Internet");
        Assert.AreEqual("+506 8888 7777", harness.ViewModel.PhoneText, "Sin conexión no cambia el dato central.");
    }

    [TestMethod]
    public async Task PhotoChangesAreLocalAndInvalidImagesAreReported()
    {
        var harness = new Harness(elevated: true);
        await harness.ViewModel.OpenAsync();
        harness.Photos.NextStatus = PhotoImportStatus.Unsupported;

        await harness.ViewModel.ChangePhotoCommand.ExecuteAsync(null);

        Assert.AreEqual(1, harness.PickerCalls);
        Assert.AreEqual(1, harness.Photos.ImportCalls);
        StringAssert.Contains(harness.ViewModel.StatusMessage, "JPEG o PNG");
        Assert.IsTrue(harness.ViewModel.ShowInitials);
        Assert.AreEqual(0, harness.Service.SaveCalls, "La foto nunca viaja a la central.");
    }

    private sealed class Harness
    {
        public Harness(bool elevated)
        {
            Elevated = elevated;
            ViewModel = new ProfilePopoverViewModel(Service, Photos, () => Elevated, () =>
            {
                PickerCalls++;
                return @"C:\fotos\yo.jpg";
            });
            ViewModel.PinResetRequested += (_, _) => PinResets++;
        }

        public bool Elevated { get; set; }
        public int PickerCalls { get; private set; }
        public int PinResets { get; private set; }
        public FakeService Service { get; } = new();
        public FakePhotos Photos { get; } = new();
        public ProfilePopoverViewModel ViewModel { get; }
    }

    private sealed class FakeService : IProfileContactService
    {
        public bool Offline { get; set; }
        public int SaveCalls { get; private set; }
        public string? LastPhone { get; private set; }
        public string? LastPin { get; private set; }
        public PhoneUpdateResult? SaveResult { get; set; }

        public Task<ProfileSnapshot?> LoadAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult<ProfileSnapshot?>(new ProfileSnapshot(
                ProfileId, "Jefe Ficticio", "jefe@planta.test", "+50688887777", IsCurrent: !Offline));

        public Task<PhoneUpdateResult> SavePhoneAsync(string? phoneInput, string pin, CancellationToken cancellationToken = default)
        {
            SaveCalls++;
            LastPhone = phoneInput;
            LastPin = pin;
            return Task.FromResult(SaveResult ?? new PhoneUpdateResult(
                PhoneUpdateStatus.Saved,
                string.IsNullOrWhiteSpace(phoneInput) ? null : PhoneNumber.Normalize(phoneInput)));
        }
    }

    private sealed class FakePhotos : IProfilePhotoStore
    {
        public PhotoImportStatus NextStatus { get; set; } = PhotoImportStatus.Saved;
        public int ImportCalls { get; private set; }

        public Task<PhotoImportStatus> ImportAsync(Guid profileId, string sourcePath, CancellationToken cancellationToken = default)
        {
            ImportCalls++;
            return Task.FromResult(NextStatus);
        }

        public byte[]? Load(Guid profileId) => null;

        public void Remove(Guid profileId)
        {
        }
    }
}
