param(
  [Parameter(Mandatory)][string]$DataRoot,
  [Parameter(Mandatory)][string]$Executable,
  [Parameter(Mandatory)][string]$Title,
  [Parameter(Mandatory)][string]$Button
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class UpgradeDialogMouse {
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
$buttonType = [System.Windows.Automation.PropertyCondition]::new(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
$buttonMatch = [System.Windows.Automation.AndCondition]::new($buttonName, $buttonType)
$deadline = [DateTime]::UtcNow.AddSeconds(50)
while ([DateTime]::UtcNow -lt $deadline) {
  foreach ($window in $desktop.FindAll($children, $windowName)) {
    $owner = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $window.Current.ProcessId)
    if (!$owner -or $owner.ExecutablePath -ne $Executable -or !$owner.CommandLine.Contains($DataRoot)) { continue }
    foreach ($control in $window.FindAll($descendants, $buttonMatch)) {
      if (!$control.Current.IsEnabled -or $control.Current.IsOffscreen) { continue }
      $action = $null
      if ($control.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$action)) {
        $action.Invoke()
        exit 0
      }
      $point = $control.GetClickablePoint()
      $hit = [System.Windows.Automation.AutomationElement]::FromPoint($point)
      if ($hit.Current.ProcessId -ne $window.Current.ProcessId) { continue }
      if ([UpgradeDialogMouse]::SetCursorPos([int]$point.X,[int]$point.Y)) {
        [UpgradeDialogMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
        [UpgradeDialogMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
        exit 0
      }
    }
  }
  Start-Sleep -Milliseconds 150
}
exit 1
