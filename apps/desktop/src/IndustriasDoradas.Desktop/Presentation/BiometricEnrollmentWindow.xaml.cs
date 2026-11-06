using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using IndustriasDoradas.Desktop.Application.Abstractions;

namespace IndustriasDoradas.Desktop.Presentation;

public partial class BiometricEnrollmentWindow : Window, IDisposable
{
    private readonly IBiometricVerificationService biometricService;
    private readonly Guid profileId;
    private readonly string displayName;
    private readonly CancellationTokenSource cancellation = new();
    private bool completed;
    private bool disposed;

    public BiometricEnrollmentWindow(
        IBiometricVerificationService biometricService,
        Guid profileId,
        string displayName)
    {
        InitializeComponent();
        this.biometricService = biometricService;
        this.profileId = profileId;
        this.displayName = displayName;
        Loaded += OnLoaded;
        Closed += OnClosed;
    }

    public BiometricOperationResult? Result { get; private set; }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        Loaded -= OnLoaded;
        var preview = new Progress<BiometricCameraFrame>(UpdatePreview);
        var status = new Progress<string>(message => EnrollmentStatus.Text = message);
        try
        {
            Result = await biometricService.EnrollAsync(
                profileId,
                displayName,
                preview,
                status,
                cancellation.Token);
        }
        catch (OperationCanceledException)
        {
            Result = new BiometricOperationResult(false, "CANCELLED", "Registro facial cancelado.");
        }
        catch (Exception exception)
        {
            Result = new BiometricOperationResult(
                false,
                "CAMERA_ERROR",
                $"La cámara no pudo completar el registro. Detalle: {exception.Message}");
        }

        if (Result.Succeeded)
        {
            completed = true;
            EnrollmentStatus.Text = Result.Message;
            EnrollmentStatus.Foreground = new SolidColorBrush(Color.FromRgb(14, 128, 67));
            CancelButton.Visibility = Visibility.Collapsed;
            DoneButton.Visibility = Visibility.Visible;
            DoneButton.Focus();
            return;
        }

        EnrollmentStatus.Text = Result.Message;
        EnrollmentStatus.Foreground = new SolidColorBrush(Color.FromRgb(180, 63, 54));
        CancelButton.Content = "CERRAR";
    }

    private void UpdatePreview(BiometricCameraFrame frame)
    {
        var bitmap = BitmapSource.Create(
            frame.Width,
            frame.Height,
            96,
            96,
            PixelFormats.Bgra32,
            null,
            frame.BgraPixels,
            frame.Stride);
        bitmap.Freeze();
        CameraPreview.Source = bitmap;
    }

    private void OnDone(object sender, RoutedEventArgs e)
    {
        DialogResult = completed;
        Close();
    }

    private void OnCancel(object sender, RoutedEventArgs e)
    {
        cancellation.Cancel();
        DialogResult = false;
        Close();
    }

    private void OnClosed(object? sender, EventArgs e)
    {
        Dispose();
    }

    public void Dispose()
    {
        if (disposed) return;
        disposed = true;
        cancellation.Cancel();
        cancellation.Dispose();
        Closed -= OnClosed;
        GC.SuppressFinalize(this);
    }
}
