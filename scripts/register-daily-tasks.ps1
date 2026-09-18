$ErrorActionPreference='Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectRoot 'logs/scheduler'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$nodePath = (Get-Command node.exe).Source
@{nodePath=$nodePath;registeredAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logDir 'runtime.json') -Encoding UTF8
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 5)
foreach($entry in @(@{name='GZDaily-CalendarRecommend';job='calendar_recommend';time='07:30'},@{name='GZDaily-MediaThenClues';job='media_then_clues';time='08:30'})) {
  $launcher=Join-Path $PSScriptRoot 'launch-daily-task.ps1'
  $action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -File `"$launcher`" -Job $($entry.job)" -WorkingDirectory $projectRoot
  $trigger=New-ScheduledTaskTrigger -Daily -At $entry.time
  Register-ScheduledTask -TaskName $entry.name -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'GZDaily real data daily business task; Asia/Shanghai; local machine and logged-in account required' -Force | Out-Null
}
Get-ScheduledTask -TaskName 'GZDaily-CalendarRecommend','GZDaily-MediaThenClues' | ForEach-Object {$info=Get-ScheduledTaskInfo -TaskName $_.TaskName;[pscustomobject]@{taskName=$_.TaskName;state=[string]$_.State;nextRun=$info.NextRunTime;lastRun=$info.LastRunTime;lastResult=$info.LastTaskResult}} | ConvertTo-Json
