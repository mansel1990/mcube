# Deploy relay to DigitalOcean droplet.
param(
  [string]$Host = "root@167.71.235.230",
  [string]$RemoteDir = "/opt/mcube-kite-relay",
  [string]$SshKey = "$env:USERPROFILE\.ssh\deploy_scanner_key"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScpArgs = @("-i", $SshKey)
$SshArgs = @("-i", $SshKey)

Write-Host "-> Copying relay files to ${Host}:${RemoteDir}"
& scp @ScpArgs "$ScriptDir\server.mjs" "$ScriptDir\gtt-payload.mjs" "$ScriptDir\package.json" "${Host}:${RemoteDir}/"

Write-Host "-> Restarting mcube-kite-relay"
& ssh @SshArgs $Host "cd $RemoteDir && npm install --omit=dev && systemctl restart mcube-kite-relay && sleep 1 && curl -s http://127.0.0.1:3100/health"

Write-Host "Done. Health should include `"gtt`":true"
