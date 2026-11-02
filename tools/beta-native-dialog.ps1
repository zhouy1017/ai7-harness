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
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class Ai7BetaDialogKeys {
  public delegate bool EnumChild(IntPtr hwnd, IntPtr data);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wparam, string text);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hwnd, EnumChild callback, IntPtr data);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr hwnd, int id);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr hwnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int capacity);
  public static string ClassName(IntPtr hwnd) { var b=new StringBuilder(128);GetClassName(hwnd,b,b.Capacity);return b.ToString(); }
  public static string[] Controls(IntPtr hwnd) { var r=new List<string>();EnumChildWindows(hwnd,(child,data)=>{if(r.Count<40)r.Add(GetDlgCtrlID(child)+":"+ClassName(child));return true;},IntPtr.Zero);return r.ToArray(); }
  public static IntPtr FileEdit(IntPtr hwnd) {
    var candidates=new List<IntPtr>();IntPtr preferred=IntPtr.Zero;
    EnumChildWindows(hwnd,(child,data)=>{
      int id=GetDlgCtrlID(child);if(ClassName(child)!="Edit"||(id!=1001&&id!=1148))return true;
      candidates.Add(child);IntPtr parent=child;
      while(parent!=IntPtr.Zero&&parent!=hwnd){if(GetDlgCtrlID(parent)==1148)preferred=child;parent=GetParent(parent);}return true;
    },IntPtr.Zero);
    return preferred!=IntPtr.Zero?preferred:candidates.Count==1?candidates[0]:IntPtr.Zero;
  }
}
'@
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
        $invoke=$null
        if($button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$invoke)){$invoke.Invoke();Write-Output 'BETA_NATIVE/button-completed';exit 0}
        if($ButtonName -eq '使用默认位置'){
          $handle=[IntPtr]$window.Current.NativeWindowHandle
          if($handle -ne [IntPtr]::Zero){[Ai7BetaDialogKeys]::PostMessage($handle,0x100,[IntPtr]13,[IntPtr]::Zero) | Out-Null;[Ai7BetaDialogKeys]::PostMessage($handle,0x101,[IntPtr]13,[IntPtr]::Zero) | Out-Null;Write-Output 'BETA_NATIVE/default-key-posted';exit 0}
        }
        Write-Output 'BETA_NATIVE/invoke-unavailable';exit 1
      }
    }else{
      # Match only the task-owned common dialog and its conventional file-name edit/OK IDs.
      $handle=[IntPtr]$window.Current.NativeWindowHandle
      if($handle -ne [IntPtr]::Zero -and [Ai7BetaDialogKeys]::ClassName($handle) -eq '#32770'){
        if(-not $observed){Write-Output ('BETA_NATIVE_DIALOG:'+(@{class='#32770';controls=@([Ai7BetaDialogKeys]::Controls($handle))} | ConvertTo-Json -Compress));$observed=$true}
        $fileEdit=[Ai7BetaDialogKeys]::FileEdit($handle);$ok=[Ai7BetaDialogKeys]::GetDlgItem($handle,1)
        if($fileEdit -ne [IntPtr]::Zero -and $ok -ne [IntPtr]::Zero){
          [Ai7BetaDialogKeys]::SendMessage($fileEdit,0xC,[IntPtr]::Zero,$FileName) | Out-Null
          [Ai7BetaDialogKeys]::PostMessage($ok,0xF5,[IntPtr]::Zero,[IntPtr]::Zero) | Out-Null
          Write-Output 'BETA_NATIVE/file-native-completed';exit 0
        }
      }
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
