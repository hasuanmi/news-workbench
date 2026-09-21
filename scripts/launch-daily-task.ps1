param([ValidateSet('calendar_recommend','media_then_clues')][string]$Job)
$ErrorActionPreference='Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$config = Get-Content -LiteralPath (Join-Path $projectRoot 'logs/scheduler/runtime.json') -Raw | ConvertFrom-Json
Set-Location -LiteralPath $projectRoot
$logDir=Join-Path $projectRoot 'logs/scheduler'
$launcherLog=Join-Path $logDir "$Job-launcher.log"
Add-Content -LiteralPath $launcherLog -Value "$([DateTime]::UtcNow.ToString('o')) launcher started"
try {
  # 移除可能存在的系统级 HTTP 代理环境变量，避免 127.0.0.1:7897 死代理导致 Supabase 连接超时/502
  foreach ($proxyVar in @('HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy','ALL_PROXY','all_proxy')) {
    [Environment]::SetEnvironmentVariable($proxyVar, $null, 'Process')
  }
  Add-Content -LiteralPath $launcherLog -Value "$([DateTime]::UtcNow.ToString('o')) proxy vars cleared"
  # Isolate the worker console so closing/interruption of a launcher console does not send Ctrl+C to Node.
  $worker=Start-Process -FilePath $config.nodePath -ArgumentList @('"' + (Join-Path $PSScriptRoot 'run-daily-task.mjs') + '"',$Job,'--task') -WorkingDirectory $projectRoot -WindowStyle Hidden -Wait -PassThru
  Add-Content -LiteralPath $launcherLog -Value "$([DateTime]::UtcNow.ToString('o')) worker exited $($worker.ExitCode)"
  exit $worker.ExitCode
} catch {
  Add-Content -LiteralPath $launcherLog -Value "$([DateTime]::UtcNow.ToString('o')) launcher failed: $($_.Exception.Message)"
  exit 1
}
