param(
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command is unavailable: $Name"
    }
}

$expectedCluster = 'infracoders-demo'
$expectedAddress = '127.0.0.1:8002'
$expectedNamespace = 'agent-context-demo'
$context = "kind-$expectedCluster"

if ($env:ENABLE_INFRACODERS_DEMO -ne 'YES') {
    throw 'Set ENABLE_INFRACODERS_DEMO=YES only after confirming this is the dedicated disposable local cluster.'
}

Require-Command 'kind'
Require-Command 'kubectl'
Require-Command 'stackql-deploy'

$clusters = @(& kind get clusters)
if ($LASTEXITCODE -ne 0 -or $clusters -notcontains $expectedCluster) {
    throw "Expected dedicated kind cluster '$expectedCluster' was not found."
}

$envFile = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path -LiteralPath $envFile)) {
    throw 'Copy .env.example to .env and keep its fixed local-only values.'
}
$envText = Get-Content -LiteralPath $envFile -Raw
foreach ($required in @(
    "KIND_CLUSTER=$expectedCluster",
    "KUBE_CLUSTER_ADDR=$expectedAddress",
    'KUBE_PROTOCOL=http',
    "K8S_NAMESPACE=$expectedNamespace"
)) {
    if ($envText -notmatch "(?m)^$([regex]::Escape($required))\s*$") {
        throw "Refusing an unexpected .env value; expected exactly $required"
    }
}

& kubectl "--context=$context" cluster-info | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Cannot reach the expected cluster context '$context'."
}

$arguments = @('build', 'stack', 'demo', '--env-file', '.env', '--show-queries')
if (-not $Apply) {
    $arguments += '--dry-run'
    Write-Output 'DRY RUN ONLY. Review every generated query; no build mutation requested.'
} else {
    $confirmation = Read-Host "Type 'APPLY $expectedNamespace' to apply to the fixed disposable demo target"
    if ($confirmation -cne "APPLY $expectedNamespace") {
        throw 'Build cancelled; confirmation did not match.'
    }
    Write-Output 'Applying only after explicit confirmation. Verify the result with queries/deployment-context.sql.'
}

& stackql-deploy @arguments
if ($LASTEXITCODE -ne 0) {
    throw "stackql-deploy exited with code $LASTEXITCODE"
}
