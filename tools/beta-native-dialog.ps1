param([Parameter(Mandatory=$true)][string]$Executable,[string]$FileName,[string]$ButtonName)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$deadline=[DateTime]::UtcNow.AddSeconds(45)
while([DateTime]::UtcNow -lt $deadline){
  $ids=@(Get-Process -Name AI7 -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Executable } | ForEach-Object Id)
  $windows=[System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
  foreach($window in $windows){
    if($window.Current.ProcessId -notin $ids){continue}
    if($ButtonName){
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
Write-Output 'BETA_NATIVE/dialog-timeout';exit 1
