param(
  [Parameter(Mandatory)][string]$DataRoot,
  [Parameter(Mandatory)][string]$Executable,
  [Parameter(Mandatory)][string]$Title,
  [Parameter(Mandatory)][string]$Button
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$desktop = [System.Windows.Automation.AutomationElement]::RootElement
$children = [System.Windows.Automation.TreeScope]::Children
$descendants = [System.Windows.Automation.TreeScope]::Descendants
$nameProperty = [System.Windows.Automation.AutomationElement]::NameProperty
$windowName = [System.Windows.Automation.PropertyCondition]::new($nameProperty, $Title)
$buttonName = [System.Windows.Automation.PropertyCondition]::new($nameProperty, $Button)
$deadline = [DateTime]::UtcNow.AddSeconds(50)
while ([DateTime]::UtcNow -lt $deadline) {
  foreach ($window in $desktop.FindAll($children, $windowName)) {
    $owner = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $window.Current.ProcessId)
    if (!$owner -or $owner.ExecutablePath -ne $Executable -or !$owner.CommandLine.Contains($DataRoot)) { continue }
    $control = $window.FindFirst($descendants, $buttonName)
    if ($null -ne $control -and $control.Current.IsEnabled) {
      $action = $control.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
      $action.Invoke()
      exit 0
    }
  }
  Start-Sleep -Milliseconds 150
}
exit 1
