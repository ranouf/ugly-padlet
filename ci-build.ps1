Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-CiStep {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "== $Name =="
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

Invoke-CiStep "Install dependencies" { pnpm install --frozen-lockfile }
Invoke-CiStep "Prettier" { pnpm format:check }
Invoke-CiStep "ESLint" { pnpm lint }
Invoke-CiStep "Typecheck" { pnpm typecheck }
Invoke-CiStep "Release note" { pnpm release-note:check }
Invoke-CiStep "Jest" { pnpm test:jest }
Invoke-CiStep "Coverage summary" { pnpm coverage:summary }
Invoke-CiStep "Playwright" { pnpm test:playwright }
Invoke-CiStep "Build" { pnpm build }
