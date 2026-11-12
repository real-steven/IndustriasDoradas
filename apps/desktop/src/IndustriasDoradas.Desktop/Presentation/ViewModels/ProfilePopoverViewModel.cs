using System.IO;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using IndustriasDoradas.Desktop.Application.Profile;

namespace IndustriasDoradas.Desktop.Presentation.ViewModels;

/// <summary>
/// Ventana compacta del avatar del jefe de planta. Sin elevación es solo lectura; con elevación
/// permite cambiar o quitar la foto local y cambiar el teléfono central (por la API, con PIN).
/// Nunca permite cambiar nombre, correo, rol, contraseña, PIN ni datos de otras personas.
/// </summary>
public sealed partial class ProfilePopoverViewModel : ObservableObject
{
    public const string ReadOnlyHintText = "Eleve el acceso para modificar su fotografía o teléfono.";

    private readonly IProfileContactService profiles;
    private readonly IProfilePhotoStore photos;
    private readonly Func<bool> isElevated;
    private readonly Func<string?> pickPhotoFile;
    private Guid profileId;
    private int loadGeneration;

    [ObservableProperty] private bool isOpen;
    [ObservableProperty] private bool isLoading;
    private string displayName = "Jefe de planta";
    private string email = "—";
    [ObservableProperty] private string phoneText = "No registrado";
    [ObservableProperty] private string? currentPhone;
    [ObservableProperty] private bool isOfflineData;
    [ObservableProperty] private ImageSource? photo;
    [ObservableProperty] private bool isEditingPhone;
    [ObservableProperty] private string phoneDraft = string.Empty;
    [ObservableProperty] private bool isSaving;
    [ObservableProperty] private bool isPickingPhoto;
    [ObservableProperty] private string? statusMessage;
    [ObservableProperty] private bool statusIsError;

    public ProfilePopoverViewModel(
        IProfileContactService profiles,
        IProfilePhotoStore photos,
        Func<bool> isElevated,
        Func<string?> pickPhotoFile)
    {
        this.profiles = profiles;
        this.photos = photos;
        this.isElevated = isElevated;
        this.pickPhotoFile = pickPhotoFile;
    }

    /// <summary>Nombre central: solo lectura en la estación.</summary>
    public string DisplayName
    {
        get => displayName;
        private set
        {
            if (SetProperty(ref displayName, value)) OnPropertyChanged(nameof(Initials));
        }
    }

    /// <summary>Correo de acceso: solo lectura en la estación.</summary>
    public string Email
    {
        get => email;
        private set => SetProperty(ref email, value);
    }

    /// <summary>Se pide a la vista que vacíe el campo de PIN (nunca se guarda en el ViewModel).</summary>
    public event EventHandler? PinResetRequested;

    public bool IsElevated => isElevated();

    public bool IsReadOnly => !IsElevated;

    public string AccessStateText => IsElevated ? "Modo Jefe de Planta activo" : "Acceso operativo";

    public string Initials
    {
        get
        {
            string[] words = DisplayName.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            string letters = words.Length >= 2
                ? $"{words[0][0]}{words[^1][0]}"
                : words.Length == 1 ? words[0][..Math.Min(2, words[0].Length)] : "?";
            return letters.ToUpperInvariant();
        }
    }

    public bool HasPhoto => Photo is not null;

    public bool ShowInitials => Photo is null;

    public bool ShowElevatedActions => IsElevated && !IsEditingPhone;

    public bool ShowPhoneEditor => IsElevated && IsEditingPhone;

    public bool HasStatus => !string.IsNullOrEmpty(StatusMessage);

    public bool CanEditPhone => IsElevated && !IsEditingPhone && !IsSaving;

    public bool CanChangePhoto => IsElevated && !IsSaving && profileId != Guid.Empty;

    public bool CanRemovePhoto => CanChangePhoto && HasPhoto;

    /// <summary>Muestra lo que esté disponible localmente al instante y luego consulta la API.</summary>
    public async Task OpenAsync()
    {
        IsOpen = true;
        ClearStatus();
        await RefreshAsync().ConfigureAwait(true);
    }

    public void Close()
    {
        CancelEdit();
        ClearStatus();
        IsOpen = false;
    }

    public async Task RefreshAsync()
    {
        int generation = ++loadGeneration;
        IsLoading = true;
        try
        {
            ProfileSnapshot? snapshot = await profiles.LoadAsync().ConfigureAwait(true);
            if (generation != loadGeneration || snapshot is null) return;
            profileId = snapshot.ProfileId;
            DisplayName = snapshot.DisplayName;
            Email = string.IsNullOrWhiteSpace(snapshot.Email) ? "—" : snapshot.Email;
            CurrentPhone = snapshot.Phone;
            IsOfflineData = !snapshot.IsCurrent;
            LoadPhoto();
        }
        finally
        {
            if (generation == loadGeneration) IsLoading = false;
            NotifyPermissions();
        }
    }

    /// <summary>La elevación cambió (por ejemplo, venció por inactividad).</summary>
    public void OnElevationChanged()
    {
        if (!IsElevated && IsEditingPhone)
        {
            CancelEdit();
            SetStatus("El modo Jefe de Planta terminó. Se descartaron los cambios sin guardar.", isError: true);
        }
        NotifyPermissions();
    }

    [RelayCommand(CanExecute = nameof(CanEditPhone))]
    private void BeginEditPhone()
    {
        if (!IsElevated) return;
        ClearStatus();
        PhoneDraft = PhoneNumber.Format(CurrentPhone);
        IsEditingPhone = true;
    }

    [RelayCommand]
    private void CancelEdit()
    {
        IsEditingPhone = false;
        PhoneDraft = string.Empty;
        PinResetRequested?.Invoke(this, EventArgs.Empty);
    }

    public async Task SavePhoneAsync(string pin)
    {
        if (!IsElevated)
        {
            CancelEdit();
            SetStatus(ReadOnlyHintText, isError: true);
            return;
        }
        if (!IsEditingPhone || IsSaving) return;
        if (!string.IsNullOrWhiteSpace(PhoneDraft) && PhoneNumber.Normalize(PhoneDraft) is null)
        {
            SetStatus("Teléfono no válido. Use 8 dígitos de Costa Rica (8888-7777) o un número internacional con + (por ejemplo +1 415 555 0100).", isError: true);
            return;
        }
        if (string.IsNullOrWhiteSpace(pin))
        {
            SetStatus("Escriba su PIN para confirmar el cambio en la central.", isError: true);
            return;
        }

        IsSaving = true;
        NotifyPermissions();
        SetStatus("Guardando en la central…", isError: false);
        try
        {
            PhoneUpdateResult result = await profiles.SavePhoneAsync(PhoneDraft, pin).ConfigureAwait(true);
            PinResetRequested?.Invoke(this, EventArgs.Empty);
            switch (result.Status)
            {
                case PhoneUpdateStatus.Saved:
                    CurrentPhone = result.Phone;
                    IsEditingPhone = false;
                    PhoneDraft = string.Empty;
                    SetStatus("Teléfono guardado en la central.", isError: false);
                    break;
                case PhoneUpdateStatus.InvalidPhone:
                    SetStatus("Teléfono no válido.", isError: true);
                    break;
                case PhoneUpdateStatus.PinRejected:
                    SetStatus("PIN incorrecto. No se guardó el teléfono.", isError: true);
                    break;
                case PhoneUpdateStatus.PinBlocked:
                    SetStatus("El PIN está bloqueado temporalmente. No se guardó el teléfono.", isError: true);
                    break;
                case PhoneUpdateStatus.ConnectionRequired:
                    SetStatus("Se necesita conexión a Internet para guardar el teléfono en la central. No se guardó ningún cambio.", isError: true);
                    break;
                case PhoneUpdateStatus.SessionExpired:
                    SetStatus("La sesión no permite este cambio. Vuelva a abrir la estación.", isError: true);
                    break;
                default:
                    SetStatus("No fue posible guardar el teléfono. Intente nuevamente.", isError: true);
                    break;
            }
        }
        finally
        {
            IsSaving = false;
            NotifyPermissions();
        }
    }

    [RelayCommand(CanExecute = nameof(CanChangePhoto))]
    private async Task ChangePhotoAsync()
    {
        if (!IsElevated) return;
        ClearStatus();
        string? path;
        IsPickingPhoto = true;
        try
        {
            path = pickPhotoFile();
        }
        finally
        {
            IsPickingPhoto = false;
        }
        if (path is null) return;
        if (!IsElevated)
        {
            SetStatus(ReadOnlyHintText, isError: true);
            return;
        }

        IsSaving = true;
        NotifyPermissions();
        try
        {
            PhotoImportStatus status = await photos.ImportAsync(profileId, path).ConfigureAwait(true);
            switch (status)
            {
                case PhotoImportStatus.Saved:
                    LoadPhoto();
                    SetStatus("Fotografía guardada solo en este equipo.", isError: false);
                    break;
                case PhotoImportStatus.TooLarge:
                    SetStatus("La imagen es demasiado grande (máximo 8 MB).", isError: true);
                    break;
                case PhotoImportStatus.Unsupported:
                    SetStatus("Solo se aceptan imágenes JPEG o PNG.", isError: true);
                    break;
                case PhotoImportStatus.TooSmall:
                    SetStatus("La imagen es demasiado pequeña.", isError: true);
                    break;
                case PhotoImportStatus.Corrupt:
                    SetStatus("La imagen está dañada o no se puede leer.", isError: true);
                    break;
                default:
                    SetStatus("No fue posible guardar la fotografía.", isError: true);
                    break;
            }
        }
        finally
        {
            IsSaving = false;
            NotifyPermissions();
        }
    }

    [RelayCommand(CanExecute = nameof(CanRemovePhoto))]
    private void RemovePhoto()
    {
        if (!IsElevated) return;
        photos.Remove(profileId);
        LoadPhoto();
        SetStatus("Fotografía quitada de este equipo.", isError: false);
        NotifyPermissions();
    }

    partial void OnCurrentPhoneChanged(string? value) =>
        PhoneText = string.IsNullOrEmpty(value) ? "No registrado" : PhoneNumber.Format(value);

    partial void OnPhotoChanged(ImageSource? value)
    {
        OnPropertyChanged(nameof(HasPhoto));
        OnPropertyChanged(nameof(ShowInitials));
        NotifyPermissions();
    }

    partial void OnStatusMessageChanged(string? value) => OnPropertyChanged(nameof(HasStatus));

    partial void OnIsEditingPhoneChanged(bool value) => NotifyPermissions();

    private void LoadPhoto()
    {
        byte[]? bytes = profileId == Guid.Empty ? null : photos.Load(profileId);
        Photo = bytes is null ? null : ToImage(bytes);
    }

    private static BitmapImage? ToImage(byte[] bytes)
    {
        try
        {
            var image = new BitmapImage();
            using var stream = new MemoryStream(bytes, writable: false);
            image.BeginInit();
            image.CacheOption = BitmapCacheOption.OnLoad;
            image.CreateOptions = BitmapCreateOptions.IgnoreColorProfile;
            image.StreamSource = stream;
            image.EndInit();
            image.Freeze();
            return image;
        }
        catch (Exception exception) when (exception is NotSupportedException or FileFormatException or InvalidOperationException or ArgumentException)
        {
            return null;
        }
    }

    private void NotifyPermissions()
    {
        OnPropertyChanged(nameof(IsElevated));
        OnPropertyChanged(nameof(IsReadOnly));
        OnPropertyChanged(nameof(AccessStateText));
        OnPropertyChanged(nameof(CanEditPhone));
        OnPropertyChanged(nameof(CanChangePhoto));
        OnPropertyChanged(nameof(CanRemovePhoto));
        OnPropertyChanged(nameof(ShowElevatedActions));
        OnPropertyChanged(nameof(ShowPhoneEditor));
        BeginEditPhoneCommand.NotifyCanExecuteChanged();
        ChangePhotoCommand.NotifyCanExecuteChanged();
        RemovePhotoCommand.NotifyCanExecuteChanged();
    }

    private void SetStatus(string message, bool isError)
    {
        StatusIsError = isError;
        StatusMessage = message;
    }

    private void ClearStatus()
    {
        StatusMessage = null;
        StatusIsError = false;
    }
}
