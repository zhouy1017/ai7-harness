param(
  [Parameter(Mandatory)][string]$DataRoot,
  [Parameter(Mandatory)][string]$Executable,
  [Parameter(Mandatory)][string]$Title,
  [Parameter(Mandatory)][string]$Button,
  [string]$Disclosure = ''
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class UpgradeDialogMouse {
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr hwnd, EnumProc proc, IntPtr param);
  delegate bool EnumProc(IntPtr hwnd, IntPtr param);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd,StringBuilder text,int max);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int max);
  [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hwnd,uint msg,IntPtr wParam,IntPtr lParam);
  public static bool ClickNamedButton(IntPtr dialog,string name) {
    bool clicked = false;
    EnumChildWindows(dialog,delegate(IntPtr hwnd,IntPtr unused) {
      var text = new StringBuilder(256);
      GetClassName(hwnd,text,text.Capacity);
      if (!String.Equals(text.ToString(),"Button",StringComparison.OrdinalIgnoreCase) || !IsWindowVisible(hwnd) || !IsWindowEnabled(hwnd)) return true;
      GetWindowText(hwnd,text,text.Capacity);
      if (text.ToString().Replace("&","").Trim() != name) return true;
      clicked = PostMessage(hwnd,0x00f5,IntPtr.Zero,IntPtr.Zero);
      return !clicked;
    },IntPtr.Zero);
    return clicked;
  }
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
'@
$desktop = [System.Windows.Automation.AutomationElement]::RootElement
$children = [System.Windows.Automation.TreeScope]::Children
$descendants = [System.Windows.Automation.TreeScope]::Descendants
$nameProperty = [System.Windows.Automation.AutomationElement]::NameProperty
$windowName = [System.Windows.Automation.PropertyCondition]::new($nameProperty, $Title)
$buttonName = [System.Windows.Automation.PropertyCondition]::new($nameProperty, $Button)
$deadline = [DateTime]::UtcNow.AddSeconds(50)
$matchedDialogs = 0
$matchedControls = 0
while ([DateTime]::UtcNow -lt $deadline) {
  foreach ($window in $desktop.FindAll($children, $windowName)) {
    $owner = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $window.Current.ProcessId)
    if (!$owner -or $owner.ExecutablePath -ne $Executable -or !$owner.CommandLine.Contains($DataRoot)) { continue }
    $matchedDialogs++
    if ($Disclosure) {
      $text = $window.FindAll($descendants, [System.Windows.Automation.Condition]::TrueCondition)
      if (!($text | Where-Object { !$_.Current.IsOffscreen -and $_.Current.Name.Contains($Disclosure) })) {
        throw 'The owned upgrade dialog did not show the expected disclosure.'
      }
    }
    $hwnd = [IntPtr]$window.Current.NativeWindowHandle
    [void][UpgradeDialogMouse]::SetForegroundWindow($hwnd)
    if ([UpgradeDialogMouse]::ClickNamedButton($hwnd,$Button)) { exit 0 }
    foreach ($control in $window.FindAll($descendants, $buttonName)) {
      $matchedControls++
      if (!$control.Current.IsEnabled -or $control.Current.IsOffscreen) { continue }
      # Task Dialog may expose the visible caption as a Text child of a push button.
      $rect = $control.Current.BoundingRectangle
      if ($rect.IsEmpty -or $rect.Width -le 0 -or $rect.Height -le 0) { continue }
      $point = [System.Windows.Point]::new($rect.Left + $rect.Width / 2, $rect.Top + $rect.Height / 2)
      # Only click the named element in the dialog's client area. The title bar can have a "Close" control too.
      $coordinates = [IntPtr](([int]$point.Y -shl 16) -bor ([int]$point.X -band 65535))
      if ([UpgradeDialogMouse]::SendMessage($hwnd,0x0084,[IntPtr]::Zero,$coordinates).ToInt32() -ne 1) { continue }
      $hit = [System.Windows.Automation.AutomationElement]::FromPoint($point)
      if ($hit.Current.ProcessId -ne $window.Current.ProcessId) { continue }
      $action = $null
      if ($control.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$action)) {
        $action.Invoke()
        exit 0
      }
      if ([UpgradeDialogMouse]::SetCursorPos([int]$point.X,[int]$point.Y)) {
        [UpgradeDialogMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
        [UpgradeDialogMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
        exit 0
      }
    }
  }
  Start-Sleep -Milliseconds 150
}
throw "Expected dialog action was unavailable (owned windows=$matchedDialogs, matching controls=$matchedControls)."
