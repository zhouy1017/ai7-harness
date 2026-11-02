param([Parameter(Mandatory=$true)][string]$Executable,[string]$FileName,[string]$ButtonName,[switch]$StopOwnedProcess)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
if($StopOwnedProcess){
  $resolved=[IO.Path]::GetFullPath($Executable)
  $prefix=[IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) 'ai7-beta-package-'))
  if(-not $resolved.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'BETA_NATIVE/stop-target-refused'}
  Get-Process -Name AI7 -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $resolved -and $_.MainWindowHandle -ne 0 } | ForEach-Object { $_.CloseMainWindow() | Out-Null }
  $closeDeadline=[DateTime]::UtcNow.AddSeconds(30)
  while([DateTime]::UtcNow -lt $closeDeadline){if(-not @(Get-Process -Name AI7 -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $resolved }).Count){Write-Output 'BETA_NATIVE/owned-process-closed';exit 0};Start-Sleep -Milliseconds 100}
  Write-Output 'BETA_NATIVE/owned-close-timeout';exit 1
}
try{
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$deadline=[DateTime]::UtcNow.AddSeconds(45)
$seenProcess=0;$seenWindow=0;$observed=$false
while([DateTime]::UtcNow -lt $deadline){
  $ids=@(Get-Process -Name AI7 -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Executable } | ForEach-Object Id)
  if($ids.Count -gt 0){$seenProcess=1}
  $windows=[System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
  foreach($window in $windows){
    if($window.Current.ProcessId -notin $ids){continue}
    $seenWindow=1
    if($ButtonName){
      if(-not $observed){
        $buttonCondition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button)
        $buttonNames=@($window.FindAll([System.Windows.Automation.TreeScope]::Descendants,$buttonCondition) | Select-Object -First 12 | ForEach-Object { $_.Current.Name })
        Write-Output ('BETA_NATIVE_UI:'+(@{window=$window.Current.Name;buttons=$buttonNames} | ConvertTo-Json -Compress));$observed=$true
      }
      $condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$ButtonName)
      $button=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$condition)
      if($button -and $button.Current.IsEnabled){
        $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        Write-Output 'BETA_NATIVE/button-completed';exit 0
      }
    }else{
      $condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'1148')
      $edit=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$condition)
      if(-not $edit){continue}
      $pattern=$null
      if(-not $edit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern,[ref]$pattern)){
        $edit=$edit.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit)))
        if(-not $edit){continue}
        $pattern=$edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
      }
      $pattern.SetValue($FileName)
      $button=$window.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'1')))
      if($button -and $button.Current.IsEnabled){
        $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        Write-Output 'BETA_NATIVE/file-completed';exit 0
      }
    }
  }
  Start-Sleep -Milliseconds 100
}
Write-Output ('BETA_NATIVE/dialog-timeout/'+$seenProcess+'/'+$seenWindow);exit 1

}catch{Write-Output ('BETA_NATIVE/error/'+$_.Exception.GetType().FullName+'/'+$_.Exception.HResult);exit 1}
