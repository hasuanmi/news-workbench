import "server-only";
import {execFile} from "node:child_process";
import {promisify} from "node:util";

/** Query the real OS registry each time. A secret or a cron expression is not a trigger. */
export async function getLocalTriggers(): Promise<Record<string,{taskName:string;enabled:boolean;state:string;lastDispatchAt:string|null;nextTriggerAt:string|null;lastResult:number}>> {
  if(process.platform!=="win32")return {};
  const command = "$ErrorActionPreference='Stop'; @(Get-ScheduledTask -TaskName 'GZDaily-CalendarRecommend','GZDaily-MediaThenClues' -ErrorAction SilentlyContinue | ForEach-Object { $i=Get-ScheduledTaskInfo -TaskName $_.TaskName; [pscustomobject]@{taskName=$_.TaskName;enabled=$_.Settings.Enabled;state=[string]$_.State;lastDispatchAt=if($i.LastRunTime.Year -gt 2000){$i.LastRunTime.ToUniversalTime().ToString('o')}else{$null};nextTriggerAt=if($i.NextRunTime.Year -gt 2000){$i.NextRunTime.ToUniversalTime().ToString('o')}else{$null};lastResult=$i.LastTaskResult} }) | ConvertTo-Json -Compress";
  try{
    const {stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command",command],{windowsHide:true,timeout:10000});
    const parsed=stdout.trim()?JSON.parse(stdout):[];const rows=Array.isArray(parsed)?parsed:[parsed];
    return Object.fromEntries(rows.map(row=>[row.taskName==="GZDaily-CalendarRecommend"?"calendar_recommend":"clue_identify",row]));
  }catch{return {};}
}
