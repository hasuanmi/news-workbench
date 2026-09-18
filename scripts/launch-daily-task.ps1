param([ValidateSet('calendar_recommend','media_then_clues')][string]$Job)
$ErrorActionPreference='Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$config = Get-Content -LiteralPath (Join-Path $projectRoot 'logs/scheduler/runtime.json') -Raw | ConvertFrom-Json
Set-Location -LiteralPath $projectRoot
$logDir=Join-Path $projectRoot 'logs/scheduler'
$launcherLog=Join-Path $logDir "$Job-launcher.log"
Add-Content -LiteralPath $launcherLog -Value "$([DateTime]::UtcNow.ToString('o')) launcher started"
try {
  # Isolate the worker console so closing/interruption of a launcher console does not send Ctrl+C to Node.
  $worker=Start-Process -FilePath $config.nodePath -ArgumentList @('"' + (Join-Path $PSScriptRoot 'run-daily-task.mjs') + '"',$Job,'--task') -WorkingDirectory $projectRoot -WindowStyle Hidden -Wait -PassThru
  Add-Content -LiteralPath $launcherLog -Value "$([DateTime]::UtcNow.ToString('o')) worker exited $($worker.ExitCode)"
  exit $worker.ExitCode
} catch {
  Add-Content -LiteralPath $launcherLog -Value "$([DateTime]::UtcNow.ToString('o')) launcher failed: $($_.Exception.Message)"
  exit 1
}
